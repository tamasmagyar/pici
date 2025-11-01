import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'child_process';
import { logError, logInfo } from './logger';
import { MAIN_PACKAGE_FILE } from './constants';
import { backupFile, restoreFile } from './file-utils';

function writePackageJson(packageJsonPath: string, packages: string[]): void {
  const dependencies: Record<string, string> = {};

  for (const pkg of packages) {
    const match = pkg.match(/^(.+?)(?:@(.+))?$/);
    if (match) {
      const [, name, version] = match;
      dependencies[name] = version || '*';
    }
  }

  const packageJson = {
    name: 'pici-temp',
    version: '1.0.0',
    dependencies,
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

function removeLockFiles(lockBackups: Array<{ path: string; exists: boolean }>): void {
  for (const backup of lockBackups) {
    if (backup.exists && fs.existsSync(backup.path)) {
      fs.unlinkSync(backup.path);
    }
  }
}

function runNpmInstall(packages: string[]): void {
  const args = ['install', '--package-lock=false', '--no-audit', '--no-fund', '--legacy-peer-deps'];

  logInfo(`Installing packages (${packages.join(', ')}) using npm...`);
  const result = spawnSync('npm', args, { stdio: 'inherit' });

  if (result.error) {
    logError(`Failed to execute npm: ${result.error.message}`);
    throw result.error;
  }

  if (result.status !== 0) {
    logError(`Package installation failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

export function installPackages(packages: string[]): void {
  if (packages.length === 0) {
    logInfo('No packages to install.');
    return;
  }

  const packageJsonPath = path.resolve(MAIN_PACKAGE_FILE);
  const packageJsonBackup = backupFile(MAIN_PACKAGE_FILE);
  const packageLockBackup = backupFile('package-lock.json');
  const yarnLockBackup = backupFile('yarn.lock');

  try {
    writePackageJson(packageJsonPath, packages);
    removeLockFiles([packageLockBackup, yarnLockBackup]);
    runNpmInstall(packages);
  } finally {
    restoreFile(packageJsonBackup);
    restoreFile(packageLockBackup);
    restoreFile(yarnLockBackup);
  }
}
