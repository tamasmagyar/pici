// Uses the real npm, offline, with local file: packages so no registry is needed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProject, type Project } from '../helpers/project';

const CLI = path.resolve(__dirname, '../../dist/index.js');
let project: Project;
let original: Record<string, string>;

beforeEach(() => {
  const local = (name: string) => ({ name, version: '1.0.0' });
  project = createProject({
    'package.json': {
      name: 'real',
      version: '1.0.0',
      dependencies: { 'pkg-a': 'file:./vendor/a', 'pkg-b': 'file:./vendor/b' },
      devDependencies: { '@local/c': 'file:./vendor/c', broken: '1.0.0' },
    },
    'package-lock.json': '{"keep": "me"}\n',
    'yarn.lock': '# yarn lockfile v1\n',
    'vendor/a/package.json': local('pkg-a'),
    'vendor/b/package.json': local('pkg-b'),
    'vendor/c/package.json': local('@local/c'),
  });
  original = project.snapshot();
});

afterEach(() => project.cleanup());

function pici(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: project.dir,
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_cache: path.join(project.dir, '..', 'cache'),
    },
    encoding: 'utf-8',
  });
}

const isInstalled = (name: string) => project.exists(`node_modules/${name}/package.json`);

describe('with real npm', { timeout: 60000 }, () => {
  it('installs only the requested package', () => {
    const result = pici('install', 'pkg-a');
    expect(result.status, result.stderr).toBe(0);
    expect(isInstalled('pkg-a')).toBe(true);
    expect(isInstalled('pkg-b')).toBe(false);
    expect(project.snapshot()).toEqual(original);
  });

  it('installs exactly the packages in a custom file', () => {
    expect(pici('add', 'pkg-b', '@local/c').status).toBe(0);
    const result = pici('install');
    expect(result.status, result.stderr).toBe(0);
    expect(isInstalled('pkg-a')).toBe(false);
    expect(isInstalled('pkg-b')).toBe(true);
    expect(isInstalled('@local/c')).toBe(true);
    expect(project.snapshot()).toMatchObject(original);
  });

  it('restores the project when npm fails', () => {
    const result = pici('install', 'broken');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Package installation failed');
    expect(project.snapshot()).toEqual(original);
  });
});
