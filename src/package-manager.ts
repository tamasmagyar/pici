import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { logInfo } from './logger';
import {
  LOCK_FILES,
  MAIN_PACKAGE_FILE,
  NPM_INSTALL_ARGS,
  TEMP_MARKER,
  TEMP_PACKAGE_NAME,
  TEMP_SUFFIX,
} from './constants';
import { readJsonFile, stashFile, unstashFile, type FileBackup } from './file-utils';
import { alignOverrides, readOverrides } from './overrides';
import type { Lockfile } from './lockfile';
import { PiciError, errorMessage } from './errors';
import { formatPackageSpec } from './package-spec';
import type { PackageJson, PackageSpec } from './types';

export const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

export interface InstallOptions {
  /** Send npm's stdout to stderr, keeping stdout clean for machine-readable output. */
  npmOutputToStderr?: boolean;
  /** Where the versions of transitive dependencies come from. */
  lockfile?: Lockfile | null;
}

interface SignalTrap {
  readonly received: NodeJS.Signals | undefined;
  attach(child: ChildProcess): void;
  dispose(): void;
}

/**
 * Keeps pici alive on Ctrl+C and similar, forwarding the signal to npm. Without this,
 * Node would exit immediately and the original files would never be restored.
 */
function trapSignals(): SignalTrap {
  let received: NodeJS.Signals | undefined;
  let child: ChildProcess | undefined;

  const handlers = FORWARDED_SIGNALS.map(signal => {
    const handler = () => {
      received = signal;
      child?.kill(signal);
    };
    process.on(signal, handler);
    return { signal, handler };
  });

  return {
    get received() {
      return received;
    },
    attach(next) {
      child = next;
    },
    dispose() {
      for (const { signal, handler } of handlers) {
        process.removeListener(signal, handler);
      }
    },
  };
}

function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (os.constants.signals[signal] || 0);
}

function runNpmInstall(trap: SignalTrap, options: InstallOptions): Promise<void> {
  const stdio: StdioOptions = options.npmOutputToStderr ? ['inherit', 2, 'inherit'] : 'inherit';

  return new Promise((resolve, reject) => {
    // On Windows npm is a .cmd file, which needs a shell. The arguments are constants.
    const child =
      process.platform === 'win32'
        ? spawn(['npm', ...NPM_INSTALL_ARGS].join(' '), { stdio, shell: true })
        : spawn('npm', [...NPM_INSTALL_ARGS], { stdio });
    trap.attach(child);

    child.on('error', err => {
      reject(new PiciError('NPM_NOT_FOUND', `Failed to execute npm: ${err.message}`));
    });

    child.on('close', (status, signal) => {
      const interrupt = trap.received || signal;
      if (interrupt) {
        reject(
          new PiciError('INTERRUPTED', `Interrupted by ${interrupt}`, signalExitCode(interrupt))
        );
      } else if (status !== 0) {
        reject(
          new PiciError(
            'NPM_FAILED',
            `Package installation failed with exit code ${status}`,
            status || 1
          )
        );
      } else {
        resolve();
      }
    });
  });
}

function readMainPackage(): PackageJson {
  const mainPath = path.resolve(MAIN_PACKAGE_FILE);
  return fs.existsSync(mainPath) ? readJsonFile<PackageJson>(mainPath) : {};
}

function createTemporaryPackageJson(
  packages: readonly PackageSpec[],
  lockfile: Lockfile | null
): Record<string, unknown> {
  const main = readMainPackage();
  const dependencies = packages.reduce<Record<string, string>>((deps, { name, version }) => {
    deps[name] = version || '*';
    return deps;
  }, {});
  const overrides = alignOverrides(readOverrides(main, lockfile?.manager), dependencies);
  // Keeping the name stops npm from renaming this package's link in a workspace.
  const keepName = typeof main.name === 'string' && main.name && !(main.name in dependencies);

  return {
    name: keepName ? main.name : TEMP_PACKAGE_NAME,
    version: typeof main.version === 'string' ? main.version : '1.0.0',
    private: true,
    [TEMP_MARKER]: true,
    dependencies,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

/** Restores every file even if some fail, then reports the failures. */
function restoreAll(backups: readonly FileBackup[]): void {
  const failures: string[] = [];

  for (const backup of backups) {
    try {
      unstashFile(backup);
    } catch (err) {
      failures.push(`${backup.originalPath} (backup: ${backup.backupPath}): ${errorMessage(err)}`);
    }
  }

  if (failures.length > 0) {
    throw new PiciError('RESTORE_FAILED', `Could not restore: ${failures.join('; ')}`);
  }
}

/**
 * Installs only `packages` by temporarily replacing package.json with a minimal one.
 * The original package.json and lock files are restored whether npm succeeds, fails
 * or is interrupted. Call it inside `withWorkspace`.
 */
export async function installPackages(
  packages: readonly PackageSpec[],
  options: InstallOptions = {}
): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  const lockfile = options.lockfile || null;
  const stub = createTemporaryPackageJson(packages, lockfile);
  const temporary = new Map([[MAIN_PACKAGE_FILE, JSON.stringify(stub, null, 2) + '\n']]);
  if (lockfile) {
    temporary.set(lockfile.file, lockfile.render(stub));
  }

  const backups: FileBackup[] = [];
  // Files put in place, so cleanup can never delete one that belongs to the user.
  const created: string[] = [];
  const trap = trapSignals();

  try {
    for (const [file, content] of temporary) {
      fs.writeFileSync(path.resolve(`${file}${TEMP_SUFFIX}`), content, 'utf-8');
    }

    for (const file of [...LOCK_FILES, MAIN_PACKAGE_FILE]) {
      backups.push(stashFile(file));
    }

    for (const file of temporary.keys()) {
      fs.renameSync(path.resolve(`${file}${TEMP_SUFFIX}`), path.resolve(file));
      created.push(path.resolve(file));
    }

    logInfo(`Installing packages (${packages.map(formatPackageSpec).join(', ')}) using npm...`);
    await runNpmInstall(trap, options);
  } finally {
    try {
      for (const file of temporary.keys()) {
        fs.rmSync(path.resolve(`${file}${TEMP_SUFFIX}`), { force: true });
      }
      // Anything that was not there to begin with is removed rather than restored.
      for (const { originalPath, exists } of backups) {
        if (!exists && created.includes(originalPath)) {
          fs.rmSync(originalPath, { force: true });
        }
      }
    } finally {
      try {
        restoreAll(backups);
      } finally {
        trap.dispose();
      }
    }
  }
}
