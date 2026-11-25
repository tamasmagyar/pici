import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROCESS_LOCK_FILE } from './constants';
import { PiciError } from './errors';

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readOwner(lockPath: string): number | undefined {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf-8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function createExclusively(lockPath: string): boolean {
  try {
    fs.writeFileSync(lockPath, `${process.pid}\n`, { flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw err;
  }
}

function lockedError(lockPath: string): PiciError {
  return new PiciError(
    'LOCKED',
    `Another pici process is using this directory. If that is not the case, delete ${lockPath}.`
  );
}

function isStale(lockPath: string): boolean {
  const owner = readOwner(lockPath);
  return owner !== undefined && !isProcessAlive(owner);
}

/** Fails if another process holds the lock, without taking it. */
export function assertNotLocked(): void {
  const lockPath = path.resolve(PROCESS_LOCK_FILE);
  if (fs.existsSync(lockPath) && !isStale(lockPath)) {
    throw lockedError(lockPath);
  }
}

/**
 * Prevents two pici processes from swapping files in the same directory at once.
 * A lock left behind by a dead process is taken over. Returns a release function.
 */
export function acquireWorkspaceLock(): () => void {
  const lockPath = path.resolve(PROCESS_LOCK_FILE);

  if (!createExclusively(lockPath)) {
    const stale = isStale(lockPath);
    if (stale) {
      fs.rmSync(lockPath, { force: true });
    }
    if (!stale || !createExclusively(lockPath)) {
      throw lockedError(lockPath);
    }
  }

  return () => fs.rmSync(lockPath, { force: true });
}
