import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { spawnSync } from 'child_process';
import { detectPackageManager, installPackages } from './package-manager';
import { PackageManager } from './types';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({
    pid: 1234,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
    status: 0,
  })),
}));

describe('package-manager', () => {
  const mockExistsSync = vi.mocked(fs.existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  describe('detectPackageManager', () => {
    it('detects yarn when yarn.lock exists', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === 'yarn.lock';
      });
      expect(detectPackageManager()).toBe(PackageManager.YARN);
    });

    it('detects npm when yarn.lock does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(detectPackageManager()).toBe(PackageManager.NPM);
    });
  });

  describe('installPackages', () => {
    it('does nothing when packages array is empty', () => {
      installPackages([]);
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('calls npm install with packages when yarn.lock does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      installPackages(['foo@1.2.3', 'bar@2.3.4']);
      expect(spawnSync).toHaveBeenCalledWith(
        PackageManager.NPM,
        ['install', 'foo@1.2.3', 'bar@2.3.4'],
        {
          stdio: 'inherit',
        }
      );
    });

    it('calls yarn add with packages when yarn.lock exists', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path === 'yarn.lock';
      });
      installPackages(['foo@1.2.3', 'bar@2.3.4']);
      expect(spawnSync).toHaveBeenCalledWith(
        PackageManager.YARN,
        ['add', 'foo@1.2.3', 'bar@2.3.4'],
        {
          stdio: 'inherit',
        }
      );
    });
  });
});
