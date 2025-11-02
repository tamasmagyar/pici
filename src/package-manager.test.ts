import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { spawnSync } from 'child_process';
import { installPackages } from './package-manager';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  renameSync: vi.fn(),
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
  const mockRenameSync = vi.mocked(fs.renameSync);

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

      // Should create temp file first, then rename original, then move temp to final
      expect(mockWriteFileSync).toHaveBeenCalled();
      const tempWriteCall = mockWriteFileSync.mock.calls.find(call =>
        call[0].toString().includes('.pici.temp')
      );
      expect(tempWriteCall).toBeDefined();
      const writtenContent = JSON.parse(tempWriteCall![1] as string);
      expect(writtenContent.dependencies).toEqual({
        foo: '1.2.3',
        bar: '2.3.4',
      });

      // Should rename original to backup, then temp to final location
      expect(mockRenameSync).toHaveBeenCalled();

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

      const tempWriteCall = mockWriteFileSync.mock.calls.find(call =>
        call[0].toString().includes('.pici.temp')
      );
      expect(tempWriteCall).toBeDefined();
      const writtenContent = JSON.parse(tempWriteCall![1] as string);
      expect(writtenContent.dependencies).toEqual({
        foo: '*',
        bar: '2.3.4',
      });
    });
  });
});
