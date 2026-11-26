import { isPlainObject } from './file-utils';
import { logWarn } from './logger';
import { DEFAULT_FIELDS } from './constants';
import { isUnsupportedRange, normalizeRange } from './version-spec';
import type { PackageJson } from './types';

export type Overrides = { [key: string]: string | Overrides };

/** The package name in an override key such as `@scope/name@^1.0.0`. */
function keyName(key: string): string {
  const at = key.indexOf('@', 1);
  return at === -1 ? key : key.slice(0, at);
}

function findDirectVersion(main: PackageJson, name: string): string | undefined {
  for (const field of DEFAULT_FIELDS) {
    const deps = main[field];
    if (isPlainObject(deps) && typeof deps[name] === 'string') {
      return deps[name];
    }
  }
  return undefined;
}

/** Copies npm overrides, replacing `$name` references that the stub could not resolve. */
function fromNpm(value: Record<string, unknown>, main: PackageJson): Overrides {
  const result: Overrides = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isPlainObject(entry)) {
      result[key] = fromNpm(entry, main);
    } else if (typeof entry === 'string') {
      const version = entry.startsWith('$') ? findDirectVersion(main, entry.slice(1)) : entry;
      if (version === undefined || isUnsupportedRange(version)) {
        logWarn(`Skipping override '${key}': cannot use '${entry}'.`);
      } else {
        result[key] = normalizeRange(version);
      }
    }
  }

  return result;
}

/** Splits a key such as `@scope/parent/child@npm:^1` into package keys, outermost first. */
function splitResolutionKey(key: string): string[] {
  const names = key.match(/(?:@[^/@]+\/)?[^/@]+(?:@(?:npm:)?[^/]+)?/g) || [];
  return names.filter(name => name !== '**').map(name => name.replace('@npm:', '@'));
}

function insert(target: Overrides, keys: readonly string[], version: string): void {
  const [key, ...rest] = keys;
  const existing = target[key];

  if (rest.length === 0) {
    target[key] = isPlainObject(existing) ? { ...existing, '.': version } : version;
    return;
  }
  const nested: Overrides =
    typeof existing === 'string' ? { '.': existing } : { ...(existing || {}) };
  target[key] = nested;
  insert(nested, rest, version);
}

function fromYarn(resolutions: Record<string, unknown>): Overrides {
  const result: Overrides = {};

  for (const [key, value] of Object.entries(resolutions)) {
    const keys = splitResolutionKey(key);
    if (typeof value !== 'string' || keys.length === 0 || isUnsupportedRange(value)) {
      logWarn(`Skipping resolution '${key}': npm cannot use '${String(value)}'.`);
    } else {
      insert(result, keys, normalizeRange(value));
    }
  }

  return result;
}

export function readOverrides(main: PackageJson, manager?: 'npm' | 'yarn'): Overrides {
  const npm = isPlainObject(main.overrides) ? main.overrides : undefined;
  const yarn = isPlainObject(main.resolutions) ? main.resolutions : undefined;
  const useYarn = yarn && (manager === 'yarn' || (manager === undefined && !npm));

  if (useYarn) {
    return fromYarn(yarn);
  }
  return npm && manager !== 'yarn' ? fromNpm(npm, main) : {};
}

/**
 * npm rejects an override that differs from a direct dependency (EOVERRIDE), so overrides
 * of the requested packages are set to the version being installed.
 */
export function alignOverrides(
  overrides: Overrides,
  dependencies: Readonly<Record<string, string>>
): Overrides {
  const aligned: Overrides = {};

  for (const [key, value] of Object.entries(overrides)) {
    const version = dependencies[keyName(key)];
    if (version === undefined) {
      aligned[key] = value;
    } else if (typeof value === 'string') {
      aligned[key] = version;
    } else {
      aligned[key] = '.' in value ? { ...value, '.': version } : value;
    }
  }

  return aligned;
}
