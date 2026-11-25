import { describe, it, expect, beforeEach } from 'vitest';
import { resolveFromCustomFile, resolveFromNames, addPackages } from './package-utils';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const withCode = (code: string) => expect.objectContaining({ code });

const MAIN = {
  dependencies: { shared: '1.0.0', dep: '^1.1.0', empty: '' },
  devDependencies: { shared: '2.0.0', dev: '^2.2.0' },
  peerDependencies: { shared: '>=3', peer: '>=3.3', empty: '3.0.0' },
  optionalDependencies: { optional: '4.4.4' },
};

beforeEach(() => context.project.write('package.json', MAIN));

describe('resolveFromCustomFile', () => {
  const custom = (dependencies: unknown) => context.project.write('c.json', { dependencies });

  it('uses package.custom.json by default', () => {
    context.project.write('package.custom.json', { dependencies: { dep: '' } });
    expect(resolveFromCustomFile().packages).toEqual([{ name: 'dep', version: '^1.1.0' }]);
  });

  it('reads versions from all four fields by default', () => {
    custom({ dep: '', dev: '', peer: '', optional: '' });
    expect(resolveFromCustomFile('c.json').packages.map(p => p.version)).toEqual([
      '^1.1.0',
      '^2.2.0',
      '>=3.3',
      '4.4.4',
    ]);
  });

  it('prefers a pinned version and allows packages unknown to package.json', () => {
    custom({ dep: ' 9.0.0 ', unknown: '1.0.0' });
    expect(resolveFromCustomFile('c.json').packages).toEqual([
      { name: 'dep', version: '9.0.0' },
      { name: 'unknown', version: '1.0.0' },
    ]);
  });

  it('treats a blank version as unpinned', () => {
    custom({ dep: '   ' });
    expect(resolveFromCustomFile('c.json').packages).toEqual([{ name: 'dep', version: '^1.1.0' }]);
  });

  it('gives priority to the earliest field', () => {
    custom({ shared: '' });
    expect(resolveFromCustomFile('c.json').packages[0].version).toBe('1.0.0');
    expect(
      resolveFromCustomFile('c.json', ['devDependencies', 'dependencies']).packages[0].version
    ).toBe('2.0.0');
  });

  it('falls through an empty version to a later field', () => {
    custom({ empty: '' });
    expect(resolveFromCustomFile('c.json').packages).toEqual([{ name: 'empty', version: '3.0.0' }]);
  });

  it('reports packages it cannot resolve', () => {
    custom({ dep: '', nope: '', dev: '' });
    expect(resolveFromCustomFile('c.json', ['dependencies'])).toEqual({
      packages: [{ name: 'dep', version: '^1.1.0' }],
      skipped: ['nope', 'dev'],
    });
  });

  it.each(['constructor', 'toString', 'hasownproperty', 'valueOf'])(
    'does not resolve %s from Object.prototype',
    name => {
      custom({ [name]: '' });
      expect(resolveFromCustomFile('c.json')).toEqual({ packages: [], skipped: [name] });
    }
  );

  it('returns nothing for a file without dependencies', () => {
    context.project.write('c.json', {});
    expect(resolveFromCustomFile('c.json')).toEqual({ packages: [], skipped: [] });
  });

  it.each([null, [], 'react', { dep: 1 }, { dep: null }])(
    'rejects malformed dependencies %j',
    dependencies => {
      custom(dependencies);
      expect(() => resolveFromCustomFile('c.json')).toThrow(withCode('INVALID_FILE'));
    }
  );

  it('rejects an invalid package name', () => {
    custom({ 'not valid': '1' });
    expect(() => resolveFromCustomFile('c.json')).toThrow(withCode('INVALID_PACKAGE'));
  });

  it('rejects a malformed field in package.json', () => {
    context.project.write('package.json', { dependencies: ['dep'] });
    custom({ dep: '' });
    expect(() => resolveFromCustomFile('c.json')).toThrow(withCode('INVALID_FILE'));
  });

  it('fails when the custom file is missing', () => {
    expect(() => resolveFromCustomFile('nope.json')).toThrow(withCode('FILE_NOT_FOUND'));
  });
});

describe('resolveFromNames', () => {
  it('resolves several names', () => {
    expect(resolveFromNames(['dep', 'dev'])).toEqual([
      { name: 'dep', version: '^1.1.0' },
      { name: 'dev', version: '^2.2.0' },
    ]);
  });

  it('uses an explicit version as is', () => {
    expect(resolveFromNames(['dep@5', 'new@1'])).toEqual([
      { name: 'dep', version: '5' },
      { name: 'new', version: '1' },
    ]);
  });

  it('keeps the last of duplicate names', () => {
    expect(resolveFromNames(['dep', 'dep@5'])).toEqual([{ name: 'dep', version: '5' }]);
  });

  it('respects the fields option', () => {
    expect(resolveFromNames(['shared'], ['peerDependencies'])[0].version).toBe('>=3');
  });

  it('agrees with resolveFromCustomFile on which field wins', () => {
    context.project.write('c.json', { dependencies: { shared: '' } });
    expect(resolveFromNames(['shared'])).toEqual(resolveFromCustomFile('c.json').packages);
  });

  it('fails as a whole and names every missing package', () => {
    expect(() => resolveFromNames(['dep', 'x', 'constructor'])).toThrow(
      "Not found in package.json: 'x', 'constructor'"
    );
  });
});

describe('addPackages', () => {
  it('creates the default file', () => {
    expect(addPackages(['react'])).toEqual([{ name: 'react', version: '' }]);
    expect(context.project.readJson('package.custom.json')).toEqual({
      dependencies: { react: '' },
    });
  });

  it('adds several packages, with versions', () => {
    addPackages(['a', '@s/b@^2'], 'c.json');
    expect(context.project.readJson('c.json').dependencies).toEqual({ a: '', '@s/b': '^2' });
  });

  it('keeps a pinned version when the name is added again', () => {
    context.project.write('c.json', { dependencies: { a: '9.9.9' } });
    expect(addPackages(['a'], 'c.json')).toEqual([{ name: 'a', version: '9.9.9' }]);
    expect(context.project.readJson('c.json').dependencies.a).toBe('9.9.9');
  });

  it('replaces a pinned version when a new one is given', () => {
    context.project.write('c.json', { dependencies: { a: '1' } });
    addPackages(['a@2'], 'c.json');
    expect(context.project.readJson('c.json').dependencies.a).toBe('2');
  });

  it('preserves unrelated keys', () => {
    context.project.write('c.json', { name: 'x', extra: { y: 1 } });
    addPackages(['a'], 'c.json');
    expect(context.project.readJson('c.json')).toEqual({
      name: 'x',
      extra: { y: 1 },
      dependencies: { a: '' },
    });
  });

  it('writes nothing on a dry run', () => {
    const before = context.project.snapshot();
    expect(addPackages(['a@1'], 'c.json', { dryRun: true })).toEqual([{ name: 'a', version: '1' }]);
    expect(context.project.snapshot()).toEqual(before);
  });

  it.each(['package.json', './package.json'])('refuses to edit %s', file => {
    const before = context.project.snapshot();
    expect(() => addPackages(['dep'], file)).toThrow(withCode('USAGE'));
    expect(context.project.snapshot()).toEqual(before);
  });

  it('writes nothing if any name is invalid', () => {
    expect(() => addPackages(['good', 'bad name'], 'c.json')).toThrow(withCode('INVALID_PACKAGE'));
    expect(context.project.exists('c.json')).toBe(false);
  });

  it('leaves a corrupt file untouched', () => {
    context.project.write('c.json', '{oops');
    expect(() => addPackages(['a'], 'c.json')).toThrow(withCode('INVALID_FILE'));
    expect(context.project.read('c.json')).toBe('{oops');
  });
});
