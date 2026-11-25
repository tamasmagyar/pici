import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOCK_FILES, MAIN_PACKAGE_FILE, TEMP_PACKAGE_NAME, TEMP_SUFFIX } from './constants';
import { describeBackup, readJsonFile, unstashFile, type FileBackup } from './file-utils';
import { PiciError } from './errors';
import { acquireWorkspaceLock, assertNotLocked } from './workspace-lock';

export const MANAGED_FILES: readonly string[] = [MAIN_PACKAGE_FILE, ...LOCK_FILES];

export function findLeftoverBackups(): FileBackup[] {
  return MANAGED_FILES.map(describeBackup).filter(backup => fs.existsSync(backup.backupPath));
}

function isTemporaryPackageJson(filePath: string): boolean {
  try {
    return readJsonFile(filePath).name === TEMP_PACKAGE_NAME;
  } catch {
    return false;
  }
}

function assertNoLeftovers(): void {
  const leftovers = findLeftoverBackups();
  if (leftovers.length > 0) {
    const paths = leftovers.map(backup => backup.backupPath).join(', ');
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

/** A file is safe to replace if it is missing or is the stub that pici itself wrote. */
function isConflict(backup: FileBackup): boolean {
  if (!backup.exists) {
    return false;
  }
  const isMain = backup.originalPath === path.resolve(MAIN_PACKAGE_FILE);
  return !isMain || !isTemporaryPackageJson(backup.originalPath);
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
      fs.rmSync(path.resolve(`${MAIN_PACKAGE_FILE}${TEMP_SUFFIX}`), { force: true });
    }

    return backups.map(backup => path.basename(backup.originalPath));
  } finally {
    release?.();
  }
}
