import * as fs from 'node:fs';
import type { PackageJson, CustomPackageJson } from './types';
import { logError } from './logger';

export function readJsonFile<T extends PackageJson | CustomPackageJson = PackageJson>(
  filePath: string
): T {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    logError(
      `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

export function writeJsonFile(filePath: string, data: PackageJson | CustomPackageJson): void {
  try {
    const jsonString = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, jsonString, 'utf-8');
  } catch (err) {
    logError(
      `Failed to write file ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    logError(`Failed to check if file exists ${filePath}`);
    return false;
  }
}
