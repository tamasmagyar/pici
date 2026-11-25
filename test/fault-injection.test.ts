// Makes individual filesystem calls fail to prove that no failure point loses user files.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installPackages } from '../src/package-manager';
import { withWorkspace } from '../src/restore';
import { useProject } from './helpers/in-process';
import { ORIGINAL_FILES } from './helpers/project';

const fault = vi.hoisted(() => ({
  shouldFail: (_operation: string, _target: string): boolean => false,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const guard = (operation: string, target: unknown) => {
    if (fault.shouldFail(operation, String(target))) {
      throw new Error(`injected ${operation} failure`);
    }
  };
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      guard('rename', to);
      actual.renameSync(from, to);
    },
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      guard('write', args[0]);
      actual.writeFileSync(...args);
    },
  };
});

const context = useProject();
const run = () =>
  withWorkspace(() =>
    installPackages([{ name: 'foo', version: '1' }], { npmOutputToStderr: true })
  );

beforeEach(() => {
  fault.shouldFail = () => false;
  Object.entries(ORIGINAL_FILES).forEach(([name, content]) => context.project.write(name, content));
});

describe('a filesystem failure never loses files', () => {
  it.each([
    ['writing the temporary file', 'write', 'package.json.pici.temp'],
    ['backing up package-lock.json', 'rename', 'package-lock.json.pici.backup'],
    ['backing up npm-shrinkwrap.json', 'rename', 'npm-shrinkwrap.json.pici.backup'],
    ['backing up yarn.lock', 'rename', 'yarn.lock.pici.backup'],
    ['backing up package.json', 'rename', 'package.json.pici.backup'],
  ])('when %s fails', async (_label, operation, suffix) => {
    fault.shouldFail = (op, target) => op === operation && target.endsWith(suffix);

    await expect(run()).rejects.toThrow('injected');

    expect(context.project.snapshot()).toEqual(ORIGINAL_FILES);
    expect(context.project.npmCalls()).toEqual([]);
  });

  it('when moving the stub into place fails', async () => {
    let injected = false;
    fault.shouldFail = (op, target) => {
      const hit = !injected && op === 'rename' && target.endsWith('/package.json');
      injected = injected || hit;
      return hit;
    };

    await expect(run()).rejects.toThrow('injected');

    expect(context.project.snapshot()).toEqual(ORIGINAL_FILES);
  });

  it('when one restore fails, the others still happen and the backup is kept', async () => {
    fault.shouldFail = (op, target) => op === 'rename' && target.endsWith('/yarn.lock');

    await expect(run()).rejects.toMatchObject({ code: 'RESTORE_FAILED' });

    const { 'yarn.lock': yarnLock, ...others } = ORIGINAL_FILES;
    expect(context.project.snapshot()).toEqual({ ...others, 'yarn.lock.pici.backup': yarnLock });
  });
});
