import { describe, it, expect } from 'vitest';
import { normalizeRange, assertSupportedRange, isRegistryRange } from './version-spec';

describe('normalizeRange', () => {
  it.each([
    ['^1.0.0', '^1.0.0'],
    [' 1 ', '1'],
    ['npm:^1.0.0', '^1.0.0'],
    ['npm:1.0.0', '1.0.0'],
    ['npm:>=1 <2', '>=1 <2'],
    ['npm:real@^1.0.0', 'npm:real@^1.0.0'],
    ['npm:@scope/real@^1.0.0', 'npm:@scope/real@^1.0.0'],
    ['file:../a', 'file:../a'],
  ])('%j becomes %j', (input, output) => {
    expect(normalizeRange(input)).toBe(output);
  });
});

describe('assertSupportedRange', () => {
  it.each(['workspace:*', 'catalog:', 'patch:a@npm%3A1#x', 'portal:../a', 'link:../a', 'jsr:^1'])(
    'rejects %s',
    range => {
      expect(() => assertSupportedRange('a', range)).toThrow(
        expect.objectContaining({ code: 'UNSUPPORTED_VERSION' })
      );
    }
  );

  it.each(['^1', 'latest', 'npm:b@1', 'file:../a', 'git+https://x/y.git', 'github:a/b'])(
    'accepts %s',
    range => {
      expect(() => assertSupportedRange('a', range)).not.toThrow();
    }
  );
});

describe('isRegistryRange', () => {
  it('excludes anything without a single registry version', () => {
    expect(['^1', '>=1 <2', 'latest', '*'].every(isRegistryRange)).toBe(true);
    expect(['npm:b@1', 'file:a', 'a/b', 'https://x/y.tgz'].some(isRegistryRange)).toBe(false);
  });
});
