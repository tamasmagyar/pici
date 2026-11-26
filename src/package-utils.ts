import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile, writeJsonFile, isPlainObject } from './file-utils';
import { DEFAULT_CUSTOM_FILE, MAIN_PACKAGE_FILE, DEFAULT_FIELDS } from './constants';
import type { PackageJson, CustomPackageJson, PackageDependencies, PackageSpec } from './types';
import { PiciError, usageError } from './errors';
import { assertValidPackageName, parsePackageSpec } from './package-spec';
import { assertSupportedRange, isRegistryRange, normalizeRange } from './version-spec';
import { readOverrides, type Overrides } from './overrides';
import { logWarn } from './logger';
import type { Lockfile } from './lockfile';

export interface ResolvedPackages {
  packages: PackageSpec[];
  /** Names listed in the custom file for which no version could be found. */
  skipped: string[];
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readDependencyField(
  json: Record<string, unknown>,
  field: string,
  filePath: string
): PackageDependencies {
  const value = json[field];
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value) || Object.values(value).some(v => typeof v !== 'string')) {
    throw new PiciError(
      'INVALID_FILE',
      `'${field}' in ${filePath} must be an object with string values`
    );
  }
  return value as PackageDependencies;
}

interface MainLookup {
  find(name: string): string | undefined;
}

/**
 * Looks versions up in the main package.json. The first field in `fields` that matches wins,
 * and the version in the lock file is preferred over the range. The file is only required
 * once a version is actually needed from it.
 */
function createMainLookup(fields: readonly string[], lockfile: Lockfile | null): MainLookup {
  const mainPath = path.resolve(MAIN_PACKAGE_FILE);
  let sources: PackageDependencies[] | undefined;
  let overrides: Overrides = {};

  const load = () => {
    const main = readJsonFile<PackageJson>(mainPath);
    overrides = lockfile ? readOverrides(main, lockfile.manager) : {};
    return fields.map(field => readDependencyField(main, field, mainPath));
  };

  return {
    find(name) {
      sources = sources || load();
      const range = sources.find(deps => hasOwn(deps, name) && deps[name])?.[name];
      if (range === undefined || !lockfile) {
        return range;
      }
      const forced = hasOwn(overrides, name) ? overrides[name] : undefined;
      const pinned =
        lockfile.pin(name, range) ||
        (typeof forced === 'string' ? lockfile.pin(name, forced) : undefined);
      if (!pinned && isRegistryRange(normalizeRange(range))) {
        logWarn(`${lockfile.file} has no version for '${name}@${range}'; using the range.`);
      }
      return pinned || range;
    },
  };
}

function toPackage(name: string, version: string): PackageSpec {
  assertSupportedRange(name, version);
  return { name, version: normalizeRange(version) };
}

export function resolveFromCustomFile(
  customFile: string = DEFAULT_CUSTOM_FILE,
  fields: readonly string[] = DEFAULT_FIELDS,
  lockfile: Lockfile | null = null
): ResolvedPackages {
  const customPath = path.resolve(customFile);
  const customPackage = readJsonFile<CustomPackageJson>(customPath);
  const customDeps = readDependencyField(customPackage, 'dependencies', customPath);
  const main = createMainLookup(fields, lockfile);
  const result: ResolvedPackages = { packages: [], skipped: [] };

  for (const [name, customVersion] of Object.entries(customDeps)) {
    assertValidPackageName(name);
    const version = customVersion.trim() || main.find(name);
    if (version) {
      result.packages.push(toPackage(name, version));
    } else {
      result.skipped.push(name);
    }
  }

  return result;
}

/**
 * Resolves packages named on the command line. An explicit `name@version` is used as is.
 * Fails as a whole if any package cannot be resolved, so nothing is partially installed.
 */
export function resolveFromNames(
  specs: readonly string[],
  fields: readonly string[] = DEFAULT_FIELDS,
  lockfile: Lockfile | null = null
): PackageSpec[] {
  const parsed = specs.map(parsePackageSpec);
  const main = createMainLookup(fields, lockfile);
  const missing: string[] = [];

  const resolved = new Map<string, PackageSpec>();
  for (const { name, version } of parsed) {
    const found = version || main.find(name);
    if (found) {
      resolved.set(name, toPackage(name, found));
    } else {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    const names = missing.map(name => `'${name}'`).join(', ');
    throw new PiciError('PACKAGE_NOT_FOUND', `Not found in ${MAIN_PACKAGE_FILE}: ${names}`);
  }

  return Array.from(resolved.values());
}

/**
 * Adds packages to a custom file, creating it if needed. A bare name keeps any version
 * that is already pinned; `name@version` replaces it. Returns the stored entries.
 */
export function addPackages(
  specs: readonly string[],
  fileName: string = DEFAULT_CUSTOM_FILE,
  { dryRun = false }: { dryRun?: boolean } = {}
): PackageSpec[] {
  const filePath = path.resolve(fileName);
  if (filePath === path.resolve(MAIN_PACKAGE_FILE)) {
    throw usageError(`Refusing to modify ${MAIN_PACKAGE_FILE}; 'add' only edits custom files.`);
  }

  const parsed = specs.map(parsePackageSpec);
  const customPackage: CustomPackageJson = fs.existsSync(filePath)
    ? readJsonFile<CustomPackageJson>(filePath)
    : { dependencies: {} };
  const dependencies = { ...readDependencyField(customPackage, 'dependencies', filePath) };

  const added = parsed.map(({ name, version }) => {
    const current = hasOwn(dependencies, name) ? dependencies[name] : '';
    dependencies[name] = version || current;
    return { name, version: dependencies[name] };
  });

  if (!dryRun) {
    writeJsonFile(filePath, { ...customPackage, dependencies });
  }

  return added;
}
