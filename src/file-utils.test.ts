import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { readJsonFile, writeJsonFile, fileExists, backupFile, restoreFile } from './file-utils';
import type { PackageJson, CustomPackageJson } from './types';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('./logger', () => ({
  logError: vi.fn(),
}));

describe('file-utils', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);
  const mockExistsSync = vi.mocked(fs.existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('reads and parses JSON file', () => {
      const mockData: PackageJson = { name: 'test', version: '1.0.0' };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockData));

      const result = readJsonFile<PackageJson>('package.json');

      expect(mockReadFileSync).toHaveBeenCalledWith('package.json', 'utf-8');
      expect(result).toEqual(mockData);
    });

    it('reads CustomPackageJson type', () => {
      const mockData: CustomPackageJson = { dependencies: { foo: '1.0.0' } };
      mockReadFileSync.mockReturnValue(JSON.stringify(mockData));

      const result = readJsonFile<CustomPackageJson>('custom.json');

      expect(result).toEqual(mockData);
    });

    it('throws error on file read failure', () => {
      const error = new Error('File not found');
      mockReadFileSync.mockImplementation(() => {
        throw error;
      });

      expect(() => readJsonFile('missing.json')).toThrow(error);
    });

    it('throws error on invalid JSON', () => {
      mockReadFileSync.mockReturnValue('invalid json');

      expect(() => readJsonFile('invalid.json')).toThrow();
    });
  });

  describe('writeJsonFile', () => {
    it('writes JSON file with proper formatting', () => {
      const data: PackageJson = { name: 'test', version: '1.0.0' };

      writeJsonFile('package.json', data);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'package.json',
        JSON.stringify(data, null, 2) + '\n',
        'utf-8'
      );
    });

    it('writes CustomPackageJson', () => {
      const data: CustomPackageJson = { dependencies: { foo: '1.0.0' } };

      writeJsonFile('custom.json', data);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(JSON.parse(writtenContent)).toEqual(data);
    });

    it('throws error on write failure', () => {
      const error = new Error('Permission denied');
      mockWriteFileSync.mockImplementation(() => {
        throw error;
      });

      expect(() => writeJsonFile('package.json', {})).toThrow(error);
    });
  });

  describe('fileExists', () => {
    it('returns true when file exists', () => {
      mockExistsSync.mockReturnValue(true);

      const result = fileExists('package.json');

      expect(mockExistsSync).toHaveBeenCalledWith('package.json');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = fileExists('missing.json');

      expect(result).toBe(false);
    });

    it('returns false and logs error on exception', () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = fileExists('file.json');

      expect(result).toBe(false);
    });
  });

  describe('backupFile', () => {
    const mockCopyFileSync = vi.mocked(fs.copyFileSync);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('creates backup when file exists', () => {
      mockExistsSync.mockReturnValue(true);

      const result = backupFile('test.json');

      expect(mockExistsSync).toHaveBeenCalled();
      expect(mockCopyFileSync).toHaveBeenCalled();
      expect(result.exists).toBe(true);
      expect(result.path).toContain('test.json');
      expect(result.backupPath).toContain('.pici.backup');
    });

    it('does not create backup when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = backupFile('missing.json');

      expect(mockCopyFileSync).not.toHaveBeenCalled();
      expect(result.exists).toBe(false);
    });
  });

  describe('restoreFile', () => {
    const mockCopyFileSync = vi.mocked(fs.copyFileSync);
    const mockUnlinkSync = vi.mocked(fs.unlinkSync);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('restores file from backup', () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return filePath.includes('.pici.backup') || filePath.includes('test.json');
      });

      const backup = {
        path: '/path/to/test.json',
        backupPath: '/path/to/test.json.pici.backup',
        exists: true,
      };

      restoreFile(backup);

      expect(mockUnlinkSync).toHaveBeenCalledWith(backup.path);
      expect(mockCopyFileSync).toHaveBeenCalledWith(backup.backupPath, backup.path);
      expect(mockUnlinkSync).toHaveBeenCalledWith(backup.backupPath);
    });

    it('does nothing if backup does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const backup = {
        path: '/path/to/test.json',
        backupPath: '/path/to/test.json.pici.backup',
        exists: false,
      };

      restoreFile(backup);

      expect(mockCopyFileSync).not.toHaveBeenCalled();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('does nothing if backup file is missing', () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return !filePath.includes('.pici.backup');
      });

      const backup = {
        path: '/path/to/test.json',
        backupPath: '/path/to/test.json.pici.backup',
        exists: true,
      };

      restoreFile(backup);

      expect(mockCopyFileSync).not.toHaveBeenCalled();
    });
  });
});
