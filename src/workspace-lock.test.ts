import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { vi } from 'vitest';
import { acquireWorkspaceLock, isProcessAlive } from './workspace-lock';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const locked = expect.objectContaining({ code: 'LOCKED' });
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

describe('isProcessAlive', () => {
  it('detects live and dead processes', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(deadPid())).toBe(false);
  });

  it("treats another user's process as alive", () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('not permitted'), { code: 'EPERM' });
    });
    expect(isProcessAlive(1)).toBe(true);
  });
});

describe('acquireWorkspaceLock', () => {
  it('records the owner and removes the file on release', () => {
    const release = acquireWorkspaceLock();
    expect(context.project.read('.pici.lock')).toBe(`${process.pid}\n`);
    release();
    expect(context.project.exists('.pici.lock')).toBe(false);
  });

  it('refuses while the owner is alive', () => {
    const release = acquireWorkspaceLock();
    expect(() => acquireWorkspaceLock()).toThrow(locked);
    expect(context.project.exists('.pici.lock')).toBe(true);
    release();
  });

  it('takes over a lock left by a dead process', () => {
    context.project.write('.pici.lock', `${deadPid()}\n`);
    acquireWorkspaceLock()();
    expect(context.project.exists('.pici.lock')).toBe(false);
  });

  it.each(['', 'garbage', '-1', '0'])('does not take over unreadable content %j', content => {
    context.project.write('.pici.lock', content);
    expect(() => acquireWorkspaceLock()).toThrow(locked);
    expect(context.project.read('.pici.lock')).toBe(content);
  });

  it('does not take over a lock path it cannot read', () => {
    fs.mkdirSync('.pici.lock');
    expect(() => acquireWorkspaceLock()).toThrow(locked);
  });

  it('passes on unexpected filesystem errors', () => {
    const gone = context.project.resolve('gone');
    fs.mkdirSync(gone);
    process.chdir(gone);
    vi.spyOn(process, 'cwd').mockReturnValue(`${gone}/missing`);
    expect(() => acquireWorkspaceLock()).toThrow(/ENOENT/);
  });
});
