import { describe, it, expect } from 'vitest';
import { readOverrides, alignOverrides } from './overrides';
import { useProject } from '../test/helpers/in-process';

const context = useProject();

describe('readOverrides', () => {
  it.each([
    [{}, undefined, {}],
    [{ overrides: { a: '1' } }, undefined, { a: '1' }],
    [{ overrides: { a: '1' } }, 'npm', { a: '1' }],
    [{ overrides: { a: '1' } }, 'yarn', {}],
    [{ resolutions: { a: '2' } }, undefined, { a: '2' }],
    [{ resolutions: { a: '2' } }, 'npm', {}],
    [{ overrides: { a: '1' }, resolutions: { a: '2' } }, undefined, { a: '1' }],
    [{ overrides: { a: '1' }, resolutions: { a: '2' } }, 'yarn', { a: '2' }],
    [{ overrides: 'bad', resolutions: [] }, undefined, {}],
  ] as const)(
    'picks the field that the package manager reads: %j %s',
    (main, manager, expected) => {
      expect(readOverrides(main as never, manager)).toEqual(expected);
    }
  );

  it('resolves $references from any dependency field', () => {
    const main = {
      devDependencies: { a: '^1' },
      overrides: { a: '$a', b: { a: '$a', c: '$gone' }, d: 'workspace:*' },
    };
    expect(readOverrides(main)).toEqual({ a: '^1', b: { a: '^1' } });
    expect(context.stderr.join()).toContain("Skipping override 'c'");
    expect(context.stderr.join()).toContain("Skipping override 'd'");
  });

  it.each([
    ['a', { a: '1' }],
    ['@s/a', { '@s/a': '1' }],
    ['**/a', { a: '1' }],
    ['a/b', { a: { b: '1' } }],
    ['@s/a/@t/b', { '@s/a': { '@t/b': '1' } }],
    ['a/**/b', { a: { b: '1' } }],
    ['**/a/**/b/c', { a: { b: { c: '1' } } }],
    ['a@npm:^2.0.0', { 'a@^2.0.0': '1' }],
    ['@s/a@npm:^2.0.0/b', { '@s/a@^2.0.0': { b: '1' } }],
  ])('converts the resolution key %s', (key, expected) => {
    expect(readOverrides({ resolutions: { [key]: '1' } })).toEqual(expected);
  });

  it.each([[{ a: '1', 'a/b': '2' }], [{ 'a/b': '2', a: '1' }]])('merges %j', resolutions => {
    expect(readOverrides({ resolutions })).toEqual({ a: { '.': '1', b: '2' } });
  });

  it('skips resolutions that npm cannot use', () => {
    const resolutions = { a: 'patch:a@npm%3A1#x', b: 1, '': '1', c: 'npm:3' };
    expect(readOverrides({ resolutions } as never)).toEqual({ c: '3' });
    expect(context.stderr).toHaveLength(3);
  });
});

describe('alignOverrides', () => {
  it('matches overrides of requested packages to the requested version', () => {
    expect(
      alignOverrides(
        {
          a: '^1',
          'a@^1': '^1',
          '@s/a@2': '9',
          b: { '.': '1', c: '2' },
          d: { e: '1' },
          other: '3',
        },
        { a: '1.5.0', '@s/a': '2.0.0', b: '1.1.0', d: '4.0.0' }
      )
    ).toEqual({
      a: '1.5.0',
      'a@^1': '1.5.0',
      '@s/a@2': '2.0.0',
      b: { '.': '1.1.0', c: '2' },
      d: { e: '1' },
      other: '3',
    });
  });
});
