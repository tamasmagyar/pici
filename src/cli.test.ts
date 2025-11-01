import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { executeCommand, parseArgs, main } from './cli';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({
    pid: 1234,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
    status: 0,
    error: null,
  })),
}));
import { spawnSync } from 'child_process';

const MAIN_PACKAGE = 'package.json';

describe('cli', () => {
  const cwd = '/mock';
  const mainPath = path.join(cwd, MAIN_PACKAGE);
  let mockFs: Record<string, string>;
  let origArgv: string[];

  beforeEach(() => {
    mockFs = {};
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: string) => {
      if (mockFs[filePath]) return mockFs[filePath];
      throw new Error('File not found: ' + filePath);
    });
    vi.mocked(fs.writeFileSync).mockImplementation((filePath: string, data: string) => {
      mockFs[filePath] = data;
    });
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => !!mockFs[filePath]);
    origArgv = process.argv;
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    beforeEach(() => {
      // parseArgs doesn't need fs mocking, so reset mocks
      vi.restoreAllMocks();
    });

    it('parses default values when no args provided', () => {
      const result = parseArgs([]);
      expect(result.command).toBe('');
      expect(result.customFile).toBe('package.custom.json');
      expect(result.fields).toEqual([
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]);
      expect(result.packageName).toBeUndefined();
    });

    it('parses custom file from args', () => {
      const result = parseArgs(['install', 'my-custom.json']);
      expect(result.customFile).toBe('my-custom.json');
    });

    it('parses fields from args', () => {
      const result = parseArgs(['install', '--fields=dependencies,devDependencies']);
      expect(result.fields).toEqual(['dependencies', 'devDependencies']);
    });

    it('parses package name for install command', () => {
      const result = parseArgs(['install', 'foo']);
      expect(result.packageName).toBe('foo');
    });

    it('does not parse package name if arg is a json file', () => {
      const result = parseArgs(['install', 'custom.json']);
      expect(result.packageName).toBeUndefined();
      expect(result.customFile).toBe('custom.json');
    });
  });

  describe('executeCommand', () => {
    beforeEach(() => {
      // Restore mocks and re-setup for tests that need fs
      vi.clearAllMocks();
      mockFs = {};
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

    it('prints help for help command', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      executeCommand('help', []);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]   : pici - Minimal custom package installer')
      );
      consoleSpy.mockRestore();
    });

    it('prints help when no command provided', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      executeCommand('', []);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]   : pici - Minimal custom package installer')
      );
      consoleSpy.mockRestore();
    });

    describe('add command', () => {
      it('adds package to default file without version', () => {
        const defaultPath = path.join(cwd, 'package.custom.json');
        mockFs[defaultPath] = JSON.stringify({ dependencies: {} });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        executeCommand('add', ['foo']);

        const updated = JSON.parse(mockFs[defaultPath]);
        expect(updated.dependencies.foo).toBe('');
        expect(consoleSpy).toHaveBeenCalledWith('[SUCCESS]: Added foo to package.custom.json');
        consoleSpy.mockRestore();
      });

      it('adds package to custom file', () => {
        const customPath = path.join(cwd, 'custom.json');
        mockFs[customPath] = JSON.stringify({ dependencies: {} });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        executeCommand('add', ['bar', 'custom.json']);

        const updated = JSON.parse(mockFs[customPath]);
        expect(updated.dependencies.bar).toBe('');
        expect(consoleSpy).toHaveBeenCalledWith('[SUCCESS]: Added bar to custom.json');
        consoleSpy.mockRestore();
      });

      it('errors when package name not provided', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        executeCommand('add', []);
        expect(errorSpy).toHaveBeenCalledWith('[ERROR]  : Specify a package.');
        errorSpy.mockRestore();
      });
    });

    describe('install command', () => {
      it('installs a package with version from package.json', () => {
        mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
        executeCommand('install', ['foo']);
        expect(spawnSync).toHaveBeenCalledWith(
          expect.stringContaining('npm'),
          expect.arrayContaining(['install', 'foo@1.2.3']),
          expect.anything()
        );
      });

      it('throws error if package not found in package.json', () => {
        mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => executeCommand('install', ['bar'])).toThrow('exit');
        expect(errorSpy).toHaveBeenCalledWith(
          "[ERROR]  : Package 'bar' not found in package.json."
        );
        errorSpy.mockRestore();
      });

      it('installs a package with version from package.json using yarn', () => {
        mockFs[mainPath] = JSON.stringify({ dependencies: { bar: '2.3.4' } });
        mockFs[path.join(cwd, 'yarn.lock')] = '';
        vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
          if (filePath === 'yarn.lock') return true;
          return !!mockFs[filePath];
        });
        executeCommand('install', ['bar']);
        expect(spawnSync).toHaveBeenCalledWith(
          expect.stringContaining('yarn'),
          expect.arrayContaining(['add', 'bar@2.3.4']),
          expect.anything()
        );
      });

      it('installs packages from custom file', () => {
        const customPath = path.join(cwd, 'my-custom.json');
        mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
        mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
        executeCommand('install', ['my-custom.json']);
        expect(spawnSync).toHaveBeenCalledWith(
          expect.stringContaining('npm'),
          expect.arrayContaining(['install', 'foo@1.2.3']),
          expect.anything()
        );
      });

      it('prints message when no packages to install', () => {
        const customPath = path.join(cwd, 'empty.json');
        mockFs[customPath] = JSON.stringify({ dependencies: {} });
        mockFs[mainPath] = JSON.stringify({ dependencies: {} });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        executeCommand('install', ['empty.json']);
        expect(consoleSpy).toHaveBeenCalledWith('[INFO]   : No packages to install.');
        consoleSpy.mockRestore();
      });
    });

    it('treats filename as implicit install command', () => {
      const customFile = 'my-custom.json';
      const customPath = path.join(cwd, customFile);
      mockFs[customPath] = JSON.stringify({ dependencies: { foo: '' } });
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });

      executeCommand('install', [customFile]);

      expect(spawnSync).toHaveBeenCalledWith(
        expect.stringContaining('npm'),
        expect.arrayContaining(['install', 'foo@1.2.3']),
        expect.anything()
      );
    });
  });

  describe('main', () => {
    it('installs a package with version from package.json', () => {
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
      process.argv = ['node', 'src/index.ts', 'install', 'foo'];
      expect(() => main()).not.toThrow();
      expect(spawnSync).toHaveBeenCalledWith(
        expect.stringContaining('npm'),
        expect.arrayContaining(['install', 'foo@1.2.3']),
        expect.anything()
      );
    });

    it('throws error if package not found in package.json', () => {
      mockFs[mainPath] = JSON.stringify({ dependencies: { foo: '1.2.3' } });
      process.argv = ['node', 'src/index.ts', 'install', 'bar'];
      expect(() => main()).toThrow('exit');
    });

    it('installs a package with version from package.json using yarn', () => {
      mockFs[mainPath] = JSON.stringify({ dependencies: { bar: '2.3.4' } });
      mockFs[path.join(cwd, 'yarn.lock')] = '';
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        if (filePath === 'yarn.lock') return true;
        return !!mockFs[filePath];
      });
      process.argv = ['node', 'src/index.ts', 'install', 'bar'];
      expect(() => main()).not.toThrow();
      expect(spawnSync).toHaveBeenCalledWith(
        expect.stringContaining('yarn'),
        expect.arrayContaining(['add', 'bar@2.3.4']),
        expect.anything()
      );
    });
  });
});
