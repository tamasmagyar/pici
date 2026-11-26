import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LOCK_FILES,
  MAIN_PACKAGE_FILE,
  TEMP_MARKER,
  TEMP_PACKAGE_NAME,
  TEMP_SUFFIX,
  TEMP_YARN_HEADER,
} from './constants';
import { describeBackup, readJsonFile, unstashFile, type FileBackup } from './file-utils';
import { PiciError } from './errors';
import { acquireWorkspaceLock, assertNotLocked } from './workspace-lock';

export const MANAGED_FILES: readonly string[] = [MAIN_PACKAGE_FILE, ...LOCK_FILES];

export function findLeftoverBackups(): FileBackup[] {
  return MANAGED_FILES.map(describeBackup).filter(backup => fs.existsSync(backup.backupPath));
}

/** Recognises the files pici puts in place while npm runs. */
function isTemporary(filePath: string): boolean {
  try {
    if (path.basename(filePath) === 'yarn.lock') {
      return fs.readFileSync(filePath, 'utf-8').startsWith(TEMP_YARN_HEADER);
    }
    const json = readJsonFile(filePath);
    const isMain = path.basename(filePath) === MAIN_PACKAGE_FILE;
    // pici 4.0.0 and older identified its package.json by name only.
    return json[TEMP_MARKER] === true || (isMain && json.name === TEMP_PACKAGE_NAME);
  } catch {
    return false;
  }
}

/** Temporary files with no original, left by a killed run in a directory that had none. */
function findOrphans(): string[] {
  return MANAGED_FILES.map(describeBackup)
    .filter(file => file.exists && !fs.existsSync(file.backupPath))
    .map(file => file.originalPath)
    .filter(isTemporary);
}

function assertNoLeftovers(): void {
  const leftovers = [...findLeftoverBackups().map(b => b.backupPath), ...findOrphans()];
  if (leftovers.length > 0) {
    const paths = leftovers.join(', ');
    throw new PiciError(
      'RESTORE_REQUIRED',
      `A previous run did not clean up (${paths}). Run 'pici restore' first.`
    );
  }
}

/**
 * Runs `action` with exclusive use of the directory, once the files in it are known to be
 * the user's own. Reading package.json outside of this could see another run's stub.
 * A read-only action only checks, and leaves no lock file.
 */
export async function withWorkspace<T>(
  action: () => Promise<T>,
  { readOnly = false }: { readOnly?: boolean } = {}
): Promise<T> {
  let release: (() => void) | undefined;
  if (readOnly) {
    assertNotLocked();
  } else {
    release = acquireWorkspaceLock();
  }

  try {
    assertNoLeftovers();
    return await action();
  } finally {
    release?.();
  }
}

/** A file is safe to replace if it is missing or was written by pici. */
function isConflict(backup: FileBackup): boolean {
  return backup.exists && !isTemporary(backup.originalPath);
}

/**
 * Recovers from a run that was killed before it could clean up (SIGKILL, power loss).
 * All or nothing: if any file changed since then, nothing is touched.
 * Returns the names of the restored files.
 */
export function restoreBackups({ dryRun = false }: { dryRun?: boolean } = {}): string[] {
  const release = dryRun ? undefined : acquireWorkspaceLock();

  try {
    const backups = findLeftoverBackups();
    const orphans = findOrphans();
    const conflicts = backups.filter(isConflict);

    if (conflicts.length > 0) {
      const details = conflicts.map(b => `${b.originalPath} (backup: ${b.backupPath})`).join(', ');
      throw new PiciError(
        'RESTORE_CONFLICT',
        `Not overwriting files that pici did not create: ${details}. ` +
          'Compare each file with its backup, then delete the one you do not want.'
      );
    }

    if (!dryRun) {
      for (const backup of backups) {
        unstashFile({ ...backup, exists: true });
      }
      for (const orphan of orphans) {
        fs.rmSync(orphan, { force: true });
      }
      for (const file of MANAGED_FILES) {
        fs.rmSync(path.resolve(`${file}${TEMP_SUFFIX}`), { force: true });
      }
    }

    return backups.map(backup => path.basename(backup.originalPath));
  } finally {
    release?.();
  }
}
