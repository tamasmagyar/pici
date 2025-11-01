import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getInstallList, addPackage, getPackageVersionFromMain } from './package-utils';
import { CustomPackageJson } from './types';
import { DEFAULT_CUSTOM_FILE, MAIN_PACKAGE_FILE } from './constants';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

describe('package-utils', () => {
  const mockFs: Record<string, string> = {};
  const cwd = '/mock';
  const defaultCustomPath = path.join(cwd, DEFAULT_CUSTOM_FILE);
  const customFileName = 'my-custom.json';
  const customPath = path.join(cwd, customFileName);
  const mainPath = path.join(cwd, MAIN_PACKAGE_FILE);

  beforeEach(() => {
    Object.keys(mockFs).forEach(key => delete mockFs[key]);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: string) => {
      if (mockFs[filePath]) return mockFs[filePath];
      throw new Error('File not found: ' + filePath);
    });
    vi.mocked(fs.writeFileSync).mockImplementation((filePath: string, data: string) => {
      mockFs[filePath] = data;
    });
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => !!mockFs[filePath]);
  });

  describe('addPackage', () => {
    it('adds a package to the default custom file', () => {
      mockFs[defaultCustomPath] = JSON.stringify({ dependencies: {} });
      addPackage('foo');
      const updated: CustomPackageJson = JSON.parse(mockFs[defaultCustomPath]);
      expect(updated.dependencies!.foo).toBe('');
    });

    it('adds a package to a custom file', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: {} });
      addPackage('bar', customFileName);
      const updated: CustomPackageJson = JSON.parse(mockFs[customPath]);
      expect(updated.dependencies!.bar).toBe('');
    });
  });

  describe('getInstallList', () => {
    it('gets install list with matching versions from custom file', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual(['foo@^1.2.3']);
    });

    it('gets install list with matching versions from default file', () => {
      mockFs[defaultCustomPath] = JSON.stringify({ dependencies: { foo: '' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const list = getInstallList(DEFAULT_CUSTOM_FILE);
      expect(list).toEqual(['foo@^1.2.3']);
    });

    it('gets empty install list if version missing in custom file', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { bar: '' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual([]);
    });

    it('uses custom version if defined in custom file', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { foo: '2.0.0' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual(['foo@2.0.0']);
    });

    it('gets install list with peerDependencies using fields option', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
      mockFs[mainPath] = JSON.stringify({ peerDependencies: { foo: '^9.9.9' } });
      const list = getInstallList(customFileName, ['peerDependencies']);
      expect(list).toEqual(['foo@^9.9.9']);
    });

    it('gets install list with optionalDependencies using fields option', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { bar: '' } });
      mockFs[mainPath] = JSON.stringify({ optionalDependencies: { bar: '1.2.3' } });
      const list = getInstallList(customFileName, ['optionalDependencies']);
      expect(list).toEqual(['bar@1.2.3']);
    });

    it('gets install list with peerDependencies by default', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
      mockFs[mainPath] = JSON.stringify({ peerDependencies: { foo: '^9.9.9' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual(['foo@^9.9.9']);
    });

    it('gets install list with optionalDependencies by default', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { bar: '' } });
      mockFs[mainPath] = JSON.stringify({ optionalDependencies: { bar: '1.2.3' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual(['bar@1.2.3']);
    });

    it('warns if no version is specified in custom file and not found in package.json', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { missing: '' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const list = getInstallList(customFileName);
      expect(list).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No version specified for 'missing'")
      );
      warnSpy.mockRestore();
    });

    it('installs package with version in custom file even if not in package.json', () => {
      mockFs[customPath] = JSON.stringify({ dependencies: { notfound: '5.0.0' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
      const list = getInstallList(customFileName);
      expect(list).toEqual(['notfound@5.0.0']);
    });
  });

  describe('getPackageVersionFromMain', () => {
    it('returns version from dependencies field', () => {
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
      const version = getPackageVersionFromMain('foo');
      expect(version).toBe('1.2.3');
    });

    it('returns version from peerDependencies field', () => {
      mockFs[mainPath] = JSON.stringify({ peerDependencies: { bar: '2.3.4' } });
      const version = getPackageVersionFromMain('bar');
      expect(version).toBe('2.3.4');
    });

    it('returns undefined if package not found', () => {
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
      const version = getPackageVersionFromMain('missing');
      expect(version).toBeUndefined();
    });

    it('respects custom fields parameter', () => {
      mockFs[mainPath] = JSON.stringify({
        dependencies: { foo: '1.2.3' },
        peerDependencies: { foo: '2.3.4' },
      });
      const version = getPackageVersionFromMain('foo', ['peerDependencies']);
      expect(version).toBe('2.3.4');
    });
  });
});
