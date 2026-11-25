// Black-box tests of the built CLI in a separate process, with the fake npm.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createProject, waitFor, ORIGINAL_FILES, type Project } from '../helpers/project';

const CLI = path.resolve(__dirname, '../../dist/index.js');
const { version: ownVersion } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')
);
let project: Project;
const running: ChildProcess[] = [];

beforeEach(() => {
  project = createProject(ORIGINAL_FILES);
});

afterEach(() => {
  for (const child of running.splice(0)) {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      // The whole process group has already exited.
    }
  }
  project.cleanup();
});

function pici(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: project.dir,
    env: project.fakeNpmEnv(env),
    encoding: 'utf-8',
  });
}

/** Starts pici in its own process group and waits until npm is running. */
async function startHanging(mode = 'hang') {
  const child = spawn(process.execPath, [CLI, 'install', 'foo'], {
    cwd: project.dir,
    env: project.fakeNpmEnv({ FAKE_NPM_MODE: mode }),
    detached: true,
    stdio: 'ignore',
  });
  running.push(child);
  const exited = new Promise<{ status: number | null; signal: string | null }>(done =>
    child.on('exit', (status, signal) => done({ status, signal }))
  );
  await waitFor(() => fs.existsSync(project.readyFile));
  return { child, exited };
}

describe('exit codes and streams', () => {
  it('succeeds and restores the project', () => {
    const result = pici(['install', 'foo', '@scope/dev']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fake-npm output');
    expect(result.stdout).toContain('[SUCCESS]: Installed 2 package(s).');
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it("exits with npm's code and restores the project", () => {
    const result = pici(['install', 'foo'], { FAKE_NPM_EXIT: '7' });
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('Package installation failed with exit code 7');
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it.each([
    [['--version'], 0],
    [['help'], 0],
    [['nonsense'], 2],
    [['add'], 2],
    [['install', 'nope'], 1],
  ])('exits correctly for %j', (args, status) => {
    expect(pici(args).status).toBe(status);
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it.each([
    ['0', 0, true],
    ['3', 3, false],
  ])('keeps stdout pure JSON when npm exits %s', (npmExit, status, ok) => {
    const result = pici(['install', 'foo', '--json'], { FAKE_NPM_EXIT: npmExit });
    expect(result.status).toBe(status);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok, command: 'install' });
    expect(result.stderr).toContain('fake-npm output');
  });

  it('runs through a bin symlink, as installed by npm', () => {
    const link = project.resolve('pici-bin');
    fs.symlinkSync(CLI, link);
    const result = spawnSync(link, ['--version'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(ownVersion);
  });
});

describe('signals', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)('restores everything on %s to the process group', async (signal, status) => {
    const { child, exited } = await startHanging();

    process.kill(-child.pid!, signal); // A negative pid signals the group, like a terminal does.

    expect(await exited).toEqual({ status, signal: null });
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it('forwards a signal sent only to pici', async () => {
    const { child, exited } = await startHanging();

    child.kill('SIGTERM');

    expect(await exited).toEqual({ status: 143, signal: null });
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it('recovers from SIGKILL through restore', async () => {
    const { child, exited } = await startHanging();
    process.kill(-child.pid!, 'SIGKILL');
    await exited;
    expect(project.readJson('package.json').name).toBe('pici-temp');

    // A second install must not back up the stub over the real package.json.
    const retry = pici(['install', 'foo', '--json']);
    expect(JSON.parse(retry.stdout).error.code).toBe('RESTORE_REQUIRED');

    expect(pici(['restore']).status).toBe(0);
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it('blocks a concurrent run in the same directory', async () => {
    const { child, exited } = await startHanging();

    const second = pici(['install', 'bar', '--json']);
    const restore = pici(['restore', '--json']);

    expect(JSON.parse(second.stdout).error.code).toBe('LOCKED');
    expect(JSON.parse(restore.stdout).error.code).toBe('LOCKED');
    child.kill('SIGINT');
    await exited;
    expect(project.snapshot()).toEqual(ORIGINAL_FILES);
  });
});
