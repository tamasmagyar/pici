import { describe, it, expect, beforeEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { installPackages } from './package-manager';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('installPackages', () => {
    it('does nothing when packages array is empty', () => {
      installPackages([]);
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('calls npm install --no-save with packages', () => {
      installPackages(['foo@1.2.3', 'bar@2.3.4']);
      expect(spawnSync).toHaveBeenCalledWith(
        'npm',
        ['install', '--no-save', 'foo@1.2.3', 'bar@2.3.4'],
        {
          stdio: 'inherit',
        }
      );
    });
  });
});
