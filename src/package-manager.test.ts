import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { spawnSync } from 'child_process';
import { installPackages } from './package-manager';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
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
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  describe('installPackages', () => {
    it('does nothing when packages array is empty', () => {
      installPackages([]);
      expect(spawnSync).not.toHaveBeenCalled();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('creates minimal package.json and runs npm install', () => {
      mockExistsSync.mockReturnValue(true);

      installPackages(['foo@1.2.3', 'bar@2.3.4']);

      // Should create minimal package.json with only the specified packages
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writeCall = mockWriteFileSync.mock.calls.find(call =>
        call[0].toString().includes('package.json')
      );
      expect(writeCall).toBeDefined();
      const writtenContent = JSON.parse(writeCall![1] as string);
      expect(writtenContent.dependencies).toEqual({
        foo: '1.2.3',
        bar: '2.3.4',
      });

      // Should call npm install without package arguments
      expect(spawnSync).toHaveBeenCalledWith(
        'npm',
        ['install', '--package-lock=false', '--no-audit', '--no-fund', '--legacy-peer-deps'],
        {
          stdio: 'inherit',
        }
      );
    });

    it('handles packages without version', () => {
      mockExistsSync.mockReturnValue(true);

      installPackages(['foo', 'bar@2.3.4']);

      const writeCall = mockWriteFileSync.mock.calls.find(call =>
        call[0].toString().includes('package.json')
      );
      const writtenContent = JSON.parse(writeCall![1] as string);
      expect(writtenContent.dependencies).toEqual({
        foo: '*',
        bar: '2.3.4',
      });
    });
  });
});
