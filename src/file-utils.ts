import * as fs from 'node:fs';
import * as path from 'node:path';
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

export interface FileBackup {
  path: string;
  backupPath: string;
  exists: boolean;
}

export function backupFile(filePath: string): FileBackup {
  const resolvedPath = path.resolve(filePath);
  const backupPath = `${resolvedPath}.pici.backup`;
  const exists = fs.existsSync(resolvedPath);

  if (exists) {
    fs.copyFileSync(resolvedPath, backupPath);
  }

  return { path: resolvedPath, backupPath, exists };
}

export function restoreFile(backup: FileBackup): void {
  if (!backup.exists || !fs.existsSync(backup.backupPath)) {
    return;
  }

  if (fs.existsSync(backup.path)) {
    fs.unlinkSync(backup.path);
  }

  fs.copyFileSync(backup.backupPath, backup.path);
  fs.unlinkSync(backup.backupPath);
}
