import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackageJson, CustomPackageJson } from './types';
import { BACKUP_SUFFIX } from './constants';
import { PiciError, errorMessage } from './errors';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readJsonFile<T extends PackageJson | CustomPackageJson = PackageJson>(
  filePath: string
): T {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PiciError('FILE_NOT_FOUND', `File not found: ${filePath}`);
    }
    throw new PiciError('INVALID_FILE', `Failed to read file ${filePath}: ${errorMessage(err)}`);
  }

  let data: unknown;
  try {
    // Some editors (notably on Windows) prepend a byte order mark.
    data = JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new PiciError('INVALID_FILE', `Invalid JSON in ${filePath}: ${errorMessage(err)}`);
  }

  if (!isPlainObject(data)) {
    throw new PiciError('INVALID_FILE', `Expected a JSON object in ${filePath}`);
  }

  return data as T;
}

export function writeJsonFile(filePath: string, data: PackageJson | CustomPackageJson): void {
  const jsonString = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, jsonString, 'utf-8');
}

export interface FileBackup {
  originalPath: string;
  backupPath: string;
  exists: boolean;
}

export function describeBackup(filePath: string): FileBackup {
  const originalPath = path.resolve(filePath);
  const backupPath = `${originalPath}${BACKUP_SUFFIX}`;
  return { originalPath, backupPath, exists: fs.existsSync(originalPath) };
}

/** Moves a file aside. Never overwrites an existing backup: it may be the only good copy. */
export function stashFile(filePath: string): FileBackup {
  const backup = describeBackup(filePath);

  if (backup.exists) {
    if (fs.existsSync(backup.backupPath)) {
      throw new PiciError(
        'RESTORE_REQUIRED',
        `Backup already exists: ${backup.backupPath}. Run 'pici restore' first.`
      );
    }
    fs.renameSync(backup.originalPath, backup.backupPath);
  }

  return backup;
}

/** Puts a stashed file back, replacing whatever is at the original path. */
export function unstashFile(backup: FileBackup): void {
  if (!backup.exists) {
    return;
  }

  // rename replaces the destination, so the original path is never deleted ahead of time.
  fs.renameSync(backup.backupPath, backup.originalPath);
}
