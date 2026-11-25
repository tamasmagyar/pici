import { describe, it, expect } from 'vitest';
import { parsePackageSpec, formatPackageSpec, isValidPackageName } from './package-spec';

describe('parsePackageSpec', () => {
  it.each([
    ['react', 'react', ''],
    ['react@18', 'react', '18'],
    ['react@^18.2.0', 'react', '^18.2.0'],
    ['react@latest', 'react', 'latest'],
    ['@types/node', '@types/node', ''],
    ['@types/node@^24.1.0', '@types/node', '^24.1.0'],
    ['lodash.get', 'lodash.get', ''],
    ['JSONStream', 'JSONStream', ''],
    ['alias@npm:@scope/real@1.0.0', 'alias', 'npm:@scope/real@1.0.0'],
    ['dep@file:../dep', 'dep', 'file:../dep'],
    ['dep@git+ssh://git@github.com/a/b.git', 'dep', 'git+ssh://git@github.com/a/b.git'],
    ['range@>=1.0.0 <2.0.0', 'range', '>=1.0.0 <2.0.0'],
  ])('parses %s', (spec, name, version) => {
    expect(parsePackageSpec(spec)).toEqual({ name, version });
  });

  it.each([
    '',
    '@',
    '@scope',
    '@scope/',
    '.hidden',
    '_private',
    '__proto__',
    'has space',
    'a/b',
    '../escape',
    'semi;colon',
    '$(whoami)',
  ])('rejects invalid name %j', spec => {
    expect(() => parsePackageSpec(spec)).toThrow(
      expect.objectContaining({ code: 'INVALID_PACKAGE' })
    );
  });

  it.each(['react@', '@types/node@', 'react@  '])('rejects missing version in %j', spec => {
    expect(() => parsePackageSpec(spec)).toThrow(/Missing version/);
  });

  it('enforces the npm name length limit', () => {
    expect(isValidPackageName('a'.repeat(214))).toBe(true);
    expect(isValidPackageName('a'.repeat(215))).toBe(false);
  });
});

describe('formatPackageSpec', () => {
  it('joins name and version', () => {
    expect(formatPackageSpec({ name: '@a/b', version: '1' })).toBe('@a/b@1');
  });

  it('omits an empty version', () => {
    expect(formatPackageSpec({ name: 'a', version: '' })).toBe('a');
  });
});
