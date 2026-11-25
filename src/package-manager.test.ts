import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { installPackages, FORWARDED_SIGNALS } from './package-manager';
import { withWorkspace } from './restore';
import { NPM_INSTALL_ARGS } from './constants';
import { useProject } from '../test/helpers/in-process';
import { ORIGINAL_FILES, waitFor } from '../test/helpers/project';

const context = useProject();
const PACKAGES = [{ name: 'foo', version: '^1.0.0' }];
const listenerCounts = () => FORWARDED_SIGNALS.map(signal => process.listenerCount(signal));
const run = (packages = PACKAGES) =>
  withWorkspace(() => installPackages(packages, { npmOutputToStderr: true }));

beforeEach(() => {
  Object.entries(ORIGINAL_FILES).forEach(([name, content]) => context.project.write(name, content));
});

const expectUntouched = () => expect(context.project.snapshot()).toEqual(ORIGINAL_FILES);

describe('installPackages while npm runs', () => {
  it('shows npm only a minimal package.json and no lock files', async () => {
    await run([
      { name: 'foo', version: '^1.0.0' },
      { name: '@s/bar', version: '' },
    ]);

    const [call] = context.project.npmCalls();
    expect(call.args).toEqual(NPM_INSTALL_ARGS);
    expect(JSON.parse(call.files['package.json'])).toEqual({
      name: 'pici-temp',
      version: '1.0.0',
      private: true,
      dependencies: { foo: '^1.0.0', '@s/bar': '*' },
    });
    expect(Object.keys(call.files).sort()).toEqual([
      '.pici.lock',
      'npm-shrinkwrap.json.pici.backup',
      'package-lock.json.pici.backup',
      'package.json',
      'package.json.pici.backup',
      'yarn.lock.pici.backup',
    ]);
  });

  it('lets npm write to the terminal by default', async () => {
    await withWorkspace(() => installPackages(PACKAGES));
    expect(context.project.npmCalls()).toHaveLength(1);
    expectUntouched();
  });
});

describe('installPackages restores every file byte for byte', () => {
  it('after success', async () => {
    await run();
    expectUntouched();
  });

  it.each([1, 7, 254])('after npm exits with %i, propagating the code', async status => {
    process.env.FAKE_NPM_EXIT = String(status);
    await expect(run()).rejects.toMatchObject({ code: 'NPM_FAILED', exitCode: status });
    expectUntouched();
  });

  it('after npm is killed', async () => {
    process.env.FAKE_NPM_MODE = 'kill-self';
    await expect(run()).rejects.toMatchObject({ code: 'INTERRUPTED', exitCode: 137 });
    expectUntouched();
  });

  it('after npm cannot be started', async () => {
    process.env.PATH = context.project.resolve('no-bin');
    await expect(run()).rejects.toMatchObject({ code: 'NPM_NOT_FOUND', exitCode: 1 });
    expectUntouched();
  });

  it('after something rewrites package.json during the install', async () => {
    process.env.FAKE_NPM_MODE = 'rewrite-package-json';
    await run();
    expectUntouched();
  });

  it.each(FORWARDED_SIGNALS.map(signal => [signal]))('after pici receives %s', async signal => {
    process.env.FAKE_NPM_MODE = 'hang';
    const result = run().catch(err => err);
    await waitFor(() => fs.existsSync(context.project.readyFile));

    process.emit(signal, signal);

    await expect(result).resolves.toMatchObject({ code: 'INTERRUPTED' });
    expectUntouched();
  });

  it('and reports interruption even if npm then exits successfully', async () => {
    process.env.FAKE_NPM_MODE = 'ignore-and-succeed';
    const result = run().catch(err => err);
    await waitFor(() => fs.existsSync(context.project.readyFile));

    process.emit('SIGINT', 'SIGINT');

    await expect(result).resolves.toMatchObject({ code: 'INTERRUPTED', exitCode: 130 });
    expectUntouched();
  });
});

describe('installPackages cleanup', () => {
  it.each(['0', '1'])('removes its signal handlers when npm exits %s', async status => {
    const before = listenerCounts();
    process.env.FAKE_NPM_EXIT = status;
    await run().catch(() => {});
    expect(listenerCounts()).toEqual(before);
  });

  it('can run twice in a row, even after a failure', async () => {
    process.env.FAKE_NPM_EXIT = '1';
    await expect(run()).rejects.toThrow();
    await expect(run()).rejects.toThrow();
    expect(context.project.npmCalls()).toHaveLength(2);
    expectUntouched();
  });

  it('names the stranded backup if it cannot restore, and restores the rest', async () => {
    process.env.FAKE_NPM_MODE = 'delete-backup';
    await expect(run()).rejects.toMatchObject({
      code: 'RESTORE_FAILED',
      message: expect.stringContaining('package.json.pici.backup'),
    });
    expect(context.project.read('yarn.lock')).toBe(ORIGINAL_FILES['yarn.lock']);
    expect(context.project.read('package-lock.json')).toBe(ORIGINAL_FILES['package-lock.json']);
  });
});

describe('installPackages preconditions', () => {
  it('does nothing for an empty list', async () => {
    await run([]);
    expect(context.project.npmCalls()).toEqual([]);
    expectUntouched();
  });

  it.each(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'])(
    'refuses to run over a leftover %s backup',
    async name => {
      context.project.write(`${name}.pici.backup`, 'only good copy');
      const before = context.project.snapshot();

      await expect(run()).rejects.toMatchObject({ code: 'RESTORE_REQUIRED' });

      expect(context.project.snapshot()).toEqual(before);
      expect(context.project.npmCalls()).toEqual([]);
    }
  );

  it('refuses to run next to another live pici process', async () => {
    context.project.write('.pici.lock', `${process.pid}`);
    await expect(run()).rejects.toMatchObject({ code: 'LOCKED' });
    expect(context.project.npmCalls()).toEqual([]);
  });

  it('works without any files and leaves none behind', async () => {
    Object.keys(ORIGINAL_FILES).forEach(name => fs.rmSync(name));
    await run();
    expect(context.project.snapshot()).toEqual({});
  });
});
