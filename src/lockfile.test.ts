import { describe, it, expect } from 'vitest';
import { loadLockfile } from './lockfile';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const STUB = { name: 'app', version: '1.0.0', private: true, piciTemp: true, dependencies: {} };

const NPM = {
  name: 'app',
  lockfileVersion: 3,
  packages: {
    '': {
      dependencies: { a: '^1.0.0', linked: '^1.0.0', alias: 'npm:a@^1', gone: '^1.0.0' },
      devDependencies: { '@s/b': '~2.0.0' },
    },
    'node_modules/a': { version: '1.2.3' },
    'node_modules/@s/b': { version: '2.0.9' },
    'node_modules/linked': { resolved: 'packages/linked', link: true },
    'node_modules/alias': { name: 'a', version: '1.2.3' },
    'node_modules/extra': { version: '9.0.0' },
  },
};

const YARN_1 = `# yarn lockfile v1


"@s/b@^1.0.0", "@s/b@^1.1.0":
  version "1.5.0"
  resolved "https://registry.yarnpkg.com/@s/b/-/b-1.5.0.tgz#abc"

a@^1.0.0, "a@>=1 <2":
  version "1.2.3"
  dependencies:
    version "^9.9.9"
`;

const YARN_MODERN = `__metadata:
  version: 8

"@s/b@npm:^1.0.0, @s/b@npm:^1.1.0":
  version: 1.5.0
  resolution: "@s/b@npm:1.5.0"
  dependencies:
    version: "npm:^9.9.9"
  linkType: hard

"al@npm:a@^1.0.0":
  version: 1.2.3
  resolution: "a@npm:1.2.3"

? "a@npm:^1.0.0, a@npm:^1.1.0"
:
  version: 1.2.3
  resolution: "a@npm:1.2.3"

"app@workspace:.":
  version: 0.0.0-use.local
  resolution: "app@workspace:."

"patched@patch:patched@npm%3A1.0.0#~/.yarn/p.patch":
  version: 1.0.0
  resolution: "patched@patch:patched@npm%3A1.0.0#~/.yarn/p.patch::version=1.0.0"

"private@npm:^1.0.0":
  version: 1.0.0
  resolution: "private@npm:1.0.0::__archiveUrl=https%3A%2F%2Fexample.test%2Fp.tgz"
`;

describe('loadLockfile', () => {
  it('finds nothing in an empty directory', () => {
    expect(loadLockfile()).toBeNull();
    expect(context.stderr).toEqual([]);
  });

  it('follows npm in preferring shrinkwrap, then package-lock, then yarn.lock', () => {
    context.project.write('yarn.lock', YARN_1);
    expect(loadLockfile()?.file).toBe('yarn.lock');
    context.project.write('package-lock.json', NPM);
    expect(loadLockfile()?.file).toBe('package-lock.json');
    context.project.write('npm-shrinkwrap.json', NPM);
    expect(loadLockfile()?.file).toBe('npm-shrinkwrap.json');
  });

  it('prefers yarn.lock if packageManager says so', () => {
    context.project.write('yarn.lock', YARN_1);
    context.project.write('package-lock.json', NPM);
    expect(loadLockfile('yarn@4.19.0')?.file).toBe('yarn.lock');
    expect(loadLockfile('npm@11.0.0')?.file).toBe('package-lock.json');
    expect(loadLockfile(42)?.file).toBe('package-lock.json');
  });

  it.each([
    ['package-lock.json', '{oops'],
    ['package-lock.json', '[]'],
    ['package-lock.json', '{"keep": "me"}'],
    ['yarn.lock', ''],
    ['yarn.lock', '<<<<<<< HEAD'],
  ])('warns about and ignores an unusable %s: %j', (file, content) => {
    context.project.write(file, content);
    expect(loadLockfile()).toBeNull();
    expect(context.stderr.join()).toContain(`Ignoring ${file}`);
  });

  it('falls back to the next lock file if the first is unusable', () => {
    context.project.write('package-lock.json', '{oops');
    context.project.write('yarn.lock', YARN_1);
    expect(loadLockfile()?.file).toBe('yarn.lock');
  });

  it.each(['pnpm-lock.yaml', 'bun.lock', 'bun.lockb'])('says that %s is not supported', file => {
    context.project.write(file, '');
    expect(loadLockfile()).toBeNull();
    expect(context.stderr.join()).toContain(`${file} is not supported`);
  });
});

describe('npm lock files', () => {
  const load = (content: unknown = NPM) => {
    context.project.write('package-lock.json', content);
    return loadLockfile()!;
  };

  it.each([
    ['a', '^1.0.0', '1.2.3'],
    ['@s/b', '~2.0.0', '2.0.9'],
    ['a', '^2.0.0', undefined], // package.json changed since the lock was written
    ['linked', '^1.0.0', undefined],
    ['alias', 'npm:a@^1', undefined],
    ['gone', '^1.0.0', undefined],
    ['extra', '^9.0.0', undefined], // transitive only
    ['constructor', '^1.0.0', undefined],
  ])('pins %s@%s to %s', (name, range, version) => {
    expect(load().pin(name, range)).toBe(version);
  });

  it('renders a marked copy whose root is the stub', () => {
    const rendered = JSON.parse(load().render(STUB));
    expect(rendered).toMatchObject({ piciTemp: true, name: 'app', lockfileVersion: 3 });
    expect(rendered.packages['']).toEqual({ name: 'app', version: '1.0.0', dependencies: {} });
    expect(rendered.packages['node_modules/a']).toEqual({ version: '1.2.3' });
  });

  it('accepts version 1 locks and a byte order mark', () => {
    const lock = load('\uFEFF{"lockfileVersion":1,"dependencies":{"a":{"version":"1.0.0"}}}');
    expect(lock.pin('a', '^1.0.0')).toBeUndefined();
    expect(JSON.parse(lock.render(STUB))).toMatchObject({
      piciTemp: true,
      dependencies: { a: { version: '1.0.0' } },
    });
  });
});

describe('Yarn lock files', () => {
  const load = (content: string) => {
    context.project.write('yarn.lock', content);
    return loadLockfile()!;
  };

  it.each([
    ['1', YARN_1, '@s/b', '^1.1.0', '1.5.0'],
    ['1', YARN_1, 'a', '>=1 <2', '1.2.3'],
    ['1', YARN_1, 'a', '^3.0.0', undefined],
    ['2+', YARN_MODERN, '@s/b', '^1.1.0', '1.5.0'],
    ['2+', YARN_MODERN, 'a', '^1.0.0', '1.2.3'],
    ['2+', YARN_MODERN, 'a', '^1.1.0', '1.2.3'],
    ['2+', YARN_MODERN, 'al', 'npm:a@^1.0.0', undefined],
    ['2+', YARN_MODERN, 'a', '^3.0.0', undefined],
  ])('version %s pins %s', (_version, content, name, range, expected) => {
    expect(load(content).pin(name, range)).toBe(expected);
  });

  it('reads Windows line endings', () => {
    expect(load(YARN_1.replace(/\n/g, '\r\n')).pin('a', '^1.0.0')).toBe('1.2.3');
    expect(load(YARN_MODERN.replace(/\n/g, '\r\n')).pin('a', '^1.0.0')).toBe('1.2.3');
  });

  it('passes Yarn 1 locks to npm as they are, with a marker', () => {
    expect(load(YARN_1).render(STUB)).toBe(`# pici-temp\n${YARN_1}`);
  });

  it('converts Yarn 2+ locks, leaving out what npm cannot use', () => {
    expect(load(YARN_MODERN).render(STUB)).toBe(`# pici-temp
# yarn lockfile v1


"@s/b@^1.0.0", "@s/b@^1.1.0":
  version "1.5.0"
  resolved "https://registry.yarnpkg.com/@s/b/-/b-1.5.0.tgz"

"al@npm:a@^1.0.0":
  version "1.2.3"
  resolved "https://registry.yarnpkg.com/a/-/a-1.2.3.tgz"

"a@^1.0.0", "a@^1.1.0":
  version "1.2.3"
  resolved "https://registry.yarnpkg.com/a/-/a-1.2.3.tgz"
`);
  });
});
