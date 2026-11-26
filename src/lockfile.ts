import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEMP_MARKER, TEMP_YARN_HEADER } from './constants';
import { isPlainObject } from './file-utils';
import { logWarn } from './logger';
import { errorMessage } from './errors';
import { isRegistryRange, normalizeRange } from './version-spec';

export interface Lockfile {
  /** File name, e.g. `yarn.lock`. */
  file: string;
  manager: 'npm' | 'yarn';
  /** The exact version locked for a dependency declared as `name@range`, if there is one. */
  pin(name: string, range: string): string | undefined;
  /** Contents of the temporary lock that tells npm which transitive versions to use. */
  render(stub: Record<string, unknown>): string;
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const UNSUPPORTED_LOCK_FILES = ['pnpm-lock.yaml', 'bun.lock', 'bun.lockb'];

function parseNpmLock(file: string, content: string): Lockfile {
  const lock: unknown = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!isPlainObject(lock) || typeof lock.lockfileVersion !== 'number') {
    throw new Error('not an npm lock file');
  }
  const packages = isPlainObject(lock.packages) ? lock.packages : {};
  const root = isPlainObject(packages['']) ? packages[''] : {};

  return {
    file,
    manager: 'npm',
    pin(name, range) {
      const isCurrent = DEPENDENCY_FIELDS.some(field => {
        const deps = root[field];
        return isPlainObject(deps) && typeof deps[name] === 'string' && deps[name] === range;
      });
      const entry = packages[`node_modules/${name}`];
      if (!isCurrent || !isPlainObject(entry) || entry.link || !isRegistryRange(range)) {
        return undefined;
      }
      return typeof entry.version === 'string' ? entry.version : undefined;
    },
    render(stub) {
      const { [TEMP_MARKER]: _marker, private: _private, ...temporaryRoot } = stub;
      const copy: Record<string, unknown> = { ...lock, name: stub.name, version: stub.version };
      if (isPlainObject(lock.packages)) {
        copy.packages = { ...packages, '': temporaryRoot };
      }
      copy[TEMP_MARKER] = true;
      return JSON.stringify(copy, null, 2) + '\n';
    },
  };
}

interface YarnEntry {
  descriptors: string[];
  version?: string;
  resolution?: string;
}

const unquote = (text: string) => text.replace(/^"|"$/g, '');

/** Reads the part that the Yarn 1 format and the YAML of Yarn 2+ have in common. */
function parseYarnEntries(content: string): YarnEntry[] {
  const entries: YarnEntry[] = [];
  let current: YarnEntry | undefined;

  for (const line of content.split(/\r?\n/)) {
    // Yarn 2+ writes very long keys as `? "key"` with the colon on the next line.
    const header = /^(?:\? (.+)|([^\s#:?].*):)$/.exec(line);
    if (header) {
      const keys = (header[1] || header[2]).split(',').map(key => key.trim().replace(/"/g, ''));
      current = { descriptors: keys };
      entries.push(current);
      continue;
    }
    const field = /^ {2}(version|resolution):? (.+)$/.exec(line);
    if (field && current) {
      current[field[1] as 'version' | 'resolution'] = unquote(field[2]);
    }
  }

  return entries;
}

/** Splits `@scope/name@range` at the separator. */
function splitDescriptor(descriptor: string): [name: string, range: string] {
  const at = descriptor.indexOf('@', 1);
  return at === -1 ? [descriptor, ''] : [descriptor.slice(0, at), descriptor.slice(at + 1)];
}

function tarballUrl(name: string, version: string): string {
  const base = name.slice(name.indexOf('/') + 1);
  return `https://registry.yarnpkg.com/${name}/-/${base}-${version}.tgz`;
}

/** npm understands Yarn 1 locks natively, so locks of Yarn 2+ are converted to that format. */
function renderAsYarnV1(entries: readonly YarnEntry[]): string {
  const blocks: string[] = [];

  for (const { descriptors, version, resolution } of entries) {
    const resolved = /^((?:@[^/@]+\/)?[^/@]+)@npm:([^:]+)$/.exec(resolution || '');
    if (!resolved || !version) {
      continue; // Workspaces, patches, git and custom registry URLs.
    }
    const keys = descriptors
      .map(splitDescriptor)
      .filter(([, range]) => !/^(?!npm:)[a-z+]+:/.test(range))
      .map(([name, range]) => `"${name}@${normalizeRange(range)}"`);
    if (keys.length > 0) {
      blocks.push(
        `${keys.join(', ')}:\n  version "${version}"\n` +
          `  resolved "${tarballUrl(resolved[1], resolved[2])}"\n`
      );
    }
  }

  return `# yarn lockfile v1\n\n\n${blocks.join('\n')}`;
}

function parseYarnLock(file: string, content: string): Lockfile {
  const isModern = /^__metadata:/m.test(content);
  if (!isModern && !/^# yarn lockfile v1/m.test(content)) {
    throw new Error('not a Yarn lock file');
  }

  const entries = parseYarnEntries(content);
  const versions = new Map<string, string>();
  for (const { descriptors, version } of entries) {
    for (const [name, range] of descriptors.map(splitDescriptor)) {
      if (version) {
        versions.set(`${name}@${normalizeRange(range)}`, version);
      }
    }
  }

  return {
    file,
    manager: 'yarn',
    pin: (name, range) =>
      isRegistryRange(range) ? versions.get(`${name}@${normalizeRange(range)}`) : undefined,
    render: () => TEMP_YARN_HEADER + (isModern ? renderAsYarnV1(entries) : content),
  };
}

function candidates(packageManager: unknown): string[] {
  const npm = ['npm-shrinkwrap.json', 'package-lock.json'];
  const usesYarn = typeof packageManager === 'string' && packageManager.startsWith('yarn@');
  return usesYarn ? ['yarn.lock', ...npm] : [...npm, 'yarn.lock'];
}

/**
 * Finds the lock file to take versions from. One that cannot be used is reported and
 * ignored, because pici can still install from the ranges in package.json.
 */
export function loadLockfile(packageManager?: unknown): Lockfile | null {
  for (const file of candidates(packageManager)) {
    if (!fs.existsSync(path.resolve(file))) {
      continue;
    }
    try {
      const content = fs.readFileSync(path.resolve(file), 'utf-8');
      return file === 'yarn.lock' ? parseYarnLock(file, content) : parseNpmLock(file, content);
    } catch (err) {
      logWarn(`Ignoring ${file}: ${errorMessage(err)}`);
    }
  }

  const unsupported = UNSUPPORTED_LOCK_FILES.find(file => fs.existsSync(path.resolve(file)));
  if (unsupported) {
    logWarn(`${unsupported} is not supported; versions come from the ranges in package.json.`);
  }
  return null;
}
