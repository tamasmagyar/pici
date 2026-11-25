import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { parseArgs, run, main, getVersion, HELP_TEXT } from './cli';
import { DEFAULT_FIELDS } from './constants';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const usage = expect.objectContaining({ code: 'USAGE', exitCode: 2 });
const MAIN = { dependencies: { foo: '1.2.3', bar: '2.0.0' }, devDependencies: { dev: '3' } };

beforeEach(() => {
  context.project.write('package.json', MAIN);
});

const installed = () =>
  context.project.npmCalls().map(call => JSON.parse(call.files['package.json']).dependencies);

/** Runs with --json and returns the single object printed to stdout. */
async function runJson(...args: string[]) {
  const code = await run([...args, '--json']);
  expect(context.stdout).toHaveLength(1);
  return { code, output: JSON.parse(context.stdout.pop()!) };
}

describe('parseArgs', () => {
  it('has defaults', () => {
    expect(parseArgs([])).toEqual({
      command: 'help',
      operands: [],
      fields: DEFAULT_FIELDS,
      json: false,
      dryRun: false,
    });
  });

  it.each([
    [['install'], 'install', []],
    [['install', 'a', 'b'], 'install', ['a', 'b']],
    [['custom.json'], 'install', ['custom.json']],
    [['add', 'a', 'c.json'], 'add', ['a', 'c.json']],
    [['restore'], 'restore', []],
    [['help'], 'help', []],
    [['-h'], 'help', []],
    [['install', '--help'], 'help', []],
    [['--version'], 'version', []],
    [['-v'], 'version', []],
    [['--help', '--version'], 'help', []],
    [['--version', '--help'], 'help', []],
    [['--dry-run'], 'help', []],
    [[''], 'help', []],
  ])('parses %j', (args, command, operands) => {
    expect(parseArgs(args)).toMatchObject({ command, operands });
  });

  it('accepts options anywhere', () => {
    expect(parseArgs(['--json', 'install', '--dry-run', 'a'])).toMatchObject({
      command: 'install',
      operands: ['a'],
      json: true,
      dryRun: true,
    });
  });

  it.each([
    [['install', '--fields=dependencies, devDependencies']],
    [['install', '--fields', 'dependencies,devDependencies,']],
  ])('parses fields from %j', args => {
    expect(parseArgs(args)).toMatchObject({
      fields: ['dependencies', 'devDependencies'],
      operands: [],
    });
  });

  it.each([
    [['--fields=']],
    [['--fields']],
    [['--fields=dependancies']],
    [['--fields=dependencies,scripts']],
    [['--force']],
    [['--dryrun']],
    [['-x']],
  ])('rejects %j', args => {
    expect(() => parseArgs(['install', ...args])).toThrow(usage);
  });

  it.each(['instal', 'remove', 'react'])('rejects unknown command %s', command => {
    expect(() => parseArgs([command])).toThrow(usage);
  });
});

describe('run: install', () => {
  it('installs named packages together', async () => {
    expect(await run(['install', 'foo', 'bar'])).toBe(0);
    expect(installed()).toEqual([{ foo: '1.2.3', bar: '2.0.0' }]);
    expect(context.stdout).toContain('[SUCCESS]: Installed 2 package(s).');
  });

  it.each([
    [['install'], 'package.custom.json'],
    [['install', 'c.json'], 'c.json'],
    [['c.json'], 'c.json'],
  ])('installs from a file with %j', async (args, file) => {
    context.project.write(file, { dependencies: { foo: '' } });
    expect(await run(args)).toBe(0);
    expect(installed()).toEqual([{ foo: '1.2.3' }]);
  });

  it('passes --fields through', async () => {
    expect(await run(['install', 'dev', '--fields=dependencies'])).toBe(1);
    expect(await run(['install', 'dev', '--fields=devDependencies'])).toBe(0);
    expect(installed()).toEqual([{ dev: '3' }]);
  });

  it('warns about skipped packages and installs the rest', async () => {
    context.project.write('c.json', { dependencies: { foo: '', nope: '' } });
    expect(await run(['c.json'])).toBe(0);
    expect(context.stderr.join()).toContain("No version specified for 'nope'");
    expect(installed()).toEqual([{ foo: '1.2.3' }]);
  });

  it('does not run npm when there is nothing to install', async () => {
    context.project.write('c.json', { dependencies: {} });
    expect(await run(['c.json'])).toBe(0);
    expect(context.stdout).toContain('[INFO]   : No packages to install.');
    expect(installed()).toEqual([]);
  });

  it('changes nothing on a dry run', async () => {
    const before = context.project.snapshot();
    expect(await run(['install', 'foo', '--dry-run'])).toBe(0);
    expect(context.stdout).toContain('[INFO]   : Would install: foo@1.2.3');
    expect(context.project.snapshot()).toEqual(before);
    expect(installed()).toEqual([]);
  });

  it.each([[['install', 'a.json', 'b.json']], [['install', 'foo', 'a.json']]])(
    'rejects ambiguous operands %j',
    async args => {
      expect(await run(args)).toBe(2);
      expect(installed()).toEqual([]);
    }
  );

  it("returns npm's exit code", async () => {
    process.env.FAKE_NPM_EXIT = '42';
    expect(await run(['install', 'foo', '--json'])).toBe(42);
  });

  it.each(['instal', 'isntall'])('never installs anything for the typo %s', async typo => {
    context.project.write('package.custom.json', { dependencies: { foo: '' } });
    expect(await run([typo])).toBe(2);
    expect(installed()).toEqual([]);
  });
});

describe('run: install over another run', () => {
  // The stub contains 'foo' at a version that must never be read as the user's own.
  const STUB = { name: 'pici-temp', dependencies: { foo: '0.0.0-stub' } };

  it.each([[[]], [['--dry-run']]])('asks for a restore after a crash %j', async flags => {
    context.project.write('package.json', STUB);
    context.project.write('package.json.pici.backup', MAIN);
    const before = context.project.snapshot();

    for (const name of ['foo', 'bar']) {
      const { output } = await runJson('install', name, ...flags);
      expect(output.error.code).toBe('RESTORE_REQUIRED');
    }
    expect(context.project.snapshot()).toEqual(before);
  });

  it.each([[[]], [['--dry-run']]])('waits its turn while another runs %j', async flags => {
    context.project.write('package.json', STUB);
    context.project.write('package.json.pici.backup', MAIN);
    context.project.write('.pici.lock', `${process.pid}`);

    for (const name of ['foo', 'bar']) {
      const { output } = await runJson('install', name, ...flags);
      expect(output.error.code).toBe('LOCKED');
    }
    expect(installed()).toEqual([]);
  });

  it('releases the lock when resolving fails', async () => {
    expect(await run(['install', 'nope'])).toBe(1);
    expect(context.project.exists('.pici.lock')).toBe(false);
  });
});

describe('run: add', () => {
  it('adds to the default file', async () => {
    expect(await run(['add', 'foo'])).toBe(0);
    expect(context.stdout).toContain('[SUCCESS]: Added foo to package.custom.json');
  });

  it('accepts the file in any position', async () => {
    expect(await run(['add', 'c.json', 'a', 'b@2'])).toBe(0);
    expect(context.project.readJson('c.json').dependencies).toEqual({ a: '', b: '2' });
  });

  it('supports a dry run', async () => {
    expect(await run(['add', 'a@1', '--dry-run'])).toBe(0);
    expect(context.stdout).toContain('[INFO]   : Would add a@1 to package.custom.json');
    expect(context.project.exists('package.custom.json')).toBe(false);
  });

  it.each([[['add']], [['add', 'c.json']], [['add', 'a', 'b.json', 'c.json']]])(
    'rejects %j',
    async args => {
      expect(await run(args)).toBe(2);
    }
  );
});

describe('run: restore', () => {
  const strand = () => context.project.write('yarn.lock.pici.backup', 'y');

  it('reports a clean directory', async () => {
    expect(await run(['restore'])).toBe(0);
    expect(context.stdout).toContain('[INFO]   : Nothing to restore.');
  });

  it('previews and then restores', async () => {
    strand();
    expect(await run(['restore', '--dry-run'])).toBe(0);
    expect(context.stdout).toContain('[INFO]   : Would restore: yarn.lock');
    expect(await run(['restore'])).toBe(0);
    expect(context.stdout).toContain('[SUCCESS]: Restored: yarn.lock');
    expect(context.project.read('yarn.lock')).toBe('y');
  });

  it('takes no operands', async () => {
    expect(await run(['restore', 'yarn.lock'])).toBe(2);
  });
});

describe('run: help and version', () => {
  it.each([[[]], [['help']], [['--help']]])('prints help for %j', async args => {
    expect(await run(args)).toBe(0);
    expect(context.stdout).toEqual([`[INFO]   : ${HELP_TEXT}`]);
  });

  it('prints the bare version', async () => {
    expect(await run(['--version'])).toBe(0);
    expect(context.stdout).toEqual([getVersion()]);
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('run: --json', () => {
  it('describes an install', async () => {
    context.project.write('c.json', { dependencies: { foo: '', nope: '' } });
    const { code, output } = await runJson('c.json');
    expect(code).toBe(0);
    expect(output).toEqual({
      ok: true,
      command: 'install',
      dryRun: false,
      packages: [{ name: 'foo', version: '1.2.3' }],
      skipped: ['nope'],
    });
  });

  it('describes an add', async () => {
    const { output } = await runJson('add', 'a@1', '--dry-run');
    expect(output).toEqual({
      ok: true,
      command: 'add',
      dryRun: true,
      file: 'package.custom.json',
      added: [{ name: 'a', version: '1' }],
    });
  });

  it('describes a restore', async () => {
    expect((await runJson('restore')).output).toMatchObject({ ok: true, restored: [] });
  });

  it('returns help and version as data', async () => {
    expect((await runJson('help')).output.help).toBe(HELP_TEXT);
    expect((await runJson('--version')).output.version).toBe(getVersion());
  });

  it.each([
    [['install', 'nope'], 'install', 'PACKAGE_NOT_FOUND', 1],
    [['missing.json'], 'install', 'FILE_NOT_FOUND', 1],
    [['add', 'bad name'], 'add', 'INVALID_PACKAGE', 1],
    [['--wat'], null, 'USAGE', 2],
  ])('describes the failure of %j', async (args, command, errorCode, exitCode) => {
    const { code, output } = await runJson(...args);
    expect(code).toBe(exitCode);
    expect(output).toEqual({
      ok: false,
      command,
      exitCode,
      error: { code: errorCode, message: expect.any(String) },
    });
  });

  it('reports unexpected errors in the same shape', async () => {
    fs.chmodSync(context.project.dir, 0o500);
    try {
      const { code, output } = await runJson('add', 'a', 'new.json');
      expect(code).toBe(1);
      expect(output.error.code).toBe('UNEXPECTED');
    } finally {
      fs.chmodSync(context.project.dir, 0o700);
    }
  });

  it('does not leak stderr-only mode into the next run', async () => {
    await runJson('help');
    await run(['help']);
    expect(context.stdout).toHaveLength(1);
  });
});

describe('main', () => {
  it('sets process.exitCode instead of exiting', async () => {
    const { argv, exitCode } = process;
    process.argv = ['node', 'pici', 'nonsense'];
    await main();
    expect(process.exitCode).toBe(2);
    process.argv = argv;
    process.exitCode = exitCode;
  });
});
