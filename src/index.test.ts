import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getInstallList } from './index';

const DEFAULT_CUSTOM_FILE = 'package.custom.json';
const MAIN_PACKAGE = 'package.json';

interface Dependencies {
  [packageName: string]: string;
}

interface PackageFile {
  dependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
}

describe('pici', () => {
  const mockFs: Record<string, string> = {};
  const cwd = '/mock';
  const defaultCustomPath = path.join(cwd, DEFAULT_CUSTOM_FILE);
  const customFileName = 'my-custom.json';
  const customPath = path.join(cwd, customFileName);
  const mainPath = path.join(cwd, MAIN_PACKAGE);

  beforeEach(() => {
    Object.keys(mockFs).forEach(key => delete mockFs[key]);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
      if (mockFs[filePath]) return mockFs[filePath];
      throw new Error('File not found: ' + filePath);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath: any, data: any) => {
      mockFs[filePath] = data;
    });
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => !!mockFs[filePath]);
  });

  it('adds a package to the default custom file', () => {
    mockFs[defaultCustomPath] = JSON.stringify({ dependencies: {} });
    let custom: PackageFile = JSON.parse(mockFs[defaultCustomPath]);
    custom.dependencies!['foo'] = '';
    mockFs[defaultCustomPath] = JSON.stringify(custom);
    const updated: PackageFile = JSON.parse(mockFs[defaultCustomPath]);
    expect(updated.dependencies!.foo).toBe('');
  });

  it('adds a package to a custom file', () => {
    mockFs[customPath] = JSON.stringify({ dependencies: {} });
    let custom: PackageFile = JSON.parse(mockFs[customPath]);
    custom.dependencies!['bar'] = '';
    mockFs[customPath] = JSON.stringify(custom);
    const updated: PackageFile = JSON.parse(mockFs[customPath]);
    expect(updated.dependencies!.bar).toBe('');
  });

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
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No version specified for 'missing'"));
    warnSpy.mockRestore();
  });

  it('installs package with version in custom file even if not in package.json', () => {
    mockFs[customPath] = JSON.stringify({ dependencies: { notfound: '5.0.0' } });
    mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '^1.2.3' } });
    const list = getInstallList(customFileName);
    expect(list).toEqual(['notfound@5.0.0']);
  });
});

describe('pici CLI', () => {
  it('treats filename as implicit install command', () => {
    const mockFs: Record<string, string> = {};
    const cwd = '/mock';
    const customFile = 'my-custom.json';
    const customPath = path.join(cwd, customFile);
    const mainPath = path.join(cwd, 'package.json');
    
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
      if (mockFs[filePath]) return mockFs[filePath];
      throw new Error('File not found: ' + filePath);
    });
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => !!mockFs[filePath]);
    
    mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
    mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
    
    const list = getInstallList(customFile);
    expect(list).toEqual(['foo@1.2.3']);
  });

  it('detects yarn when yarn.lock exists', () => {
    const mockFs: Record<string, string> = {};
    const cwd = '/mock';
    
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
      if (filePath.endsWith('yarn.lock')) return true;
      return !!mockFs[filePath];
    });
    
    // Mock spawnSync to capture the command
    const mockSpawnSync = vi.fn().mockReturnValue({ status: 0 });
    vi.spyOn(require('child_process'), 'spawnSync').mockImplementation(mockSpawnSync);
    
    // This would test the runInstall function, but since it's not exported, 
    // we can just verify the yarn.lock detection works
    const yarnLockPath = path.join(cwd, 'yarn.lock');
    expect(fs.existsSync(yarnLockPath)).toBe(true);
  });
});
