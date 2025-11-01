import * as path from 'node:path';
import { readJsonFile, fileExists, writeJsonFile } from './file-utils';
import { DEFAULT_CUSTOM_FILE, MAIN_PACKAGE_FILE, DEFAULT_FIELDS } from './constants';
import type { PackageJson, CustomPackageJson, PackageDependencies } from './types';
import { logWarn } from './logger';

export function getInstallList(
  customFile: string = DEFAULT_CUSTOM_FILE,
  fields: readonly string[] = DEFAULT_FIELDS
): string[] {
  const customPath = path.resolve(customFile);
  const mainPath = path.resolve(MAIN_PACKAGE_FILE);

  const customPackage = readJsonFile<CustomPackageJson>(customPath);
  const mainPackage = readJsonFile<PackageJson>(mainPath);

  const customDeps: PackageDependencies = customPackage.dependencies || {};

  // Collect all dependencies from specified fields in main package.json
  const mainDeps: PackageDependencies = fields.reduce((acc, field) => {
    const deps = mainPackage[field as keyof PackageJson] as PackageDependencies | undefined;
    return { ...acc, ...(deps || {}) };
  }, {} as PackageDependencies);

  return Object.entries(customDeps).flatMap(([pkg, version]) => {
    // If version is specified in custom file, use it
    if (typeof version === 'string' && version.trim()) {
      return [`${pkg}@${version}`];
    }

    // Otherwise, try to find version in main package.json
    if (mainDeps[pkg]) {
      return [`${pkg}@${mainDeps[pkg]}`];
    }

    logWarn(
      `No version specified for '${pkg}' in custom file and not found in selected fields of main package.json. This package will be skipped.`
    );
    return [];
  });
}

export function addPackage(packageName: string, fileName: string = DEFAULT_CUSTOM_FILE): void {
  const filePath = path.resolve(fileName);
  const customPackage: CustomPackageJson = fileExists(filePath)
    ? readJsonFile<CustomPackageJson>(filePath)
    : { dependencies: {} };

  customPackage.dependencies = customPackage.dependencies || {};
  customPackage.dependencies[packageName] = '';

  writeJsonFile(filePath, customPackage);
}

export function getPackageVersionFromMain(
  packageName: string,
  fields: readonly string[] = DEFAULT_FIELDS
): string | undefined {
  const mainPath = path.resolve(MAIN_PACKAGE_FILE);
  const mainPackage = readJsonFile<PackageJson>(mainPath);

  for (const field of fields) {
    const deps = mainPackage[field as keyof PackageJson] as PackageDependencies | undefined;
    if (deps && deps[packageName]) {
      return deps[packageName];
    }
  }

  return undefined;
}
