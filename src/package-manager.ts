import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'child_process';
import { logError, logInfo } from './logger';
import { MAIN_PACKAGE_FILE } from './constants';
import { stashFile, unstashFile } from './file-utils';

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

function removeLockFiles(_lockBackups: Array<{ originalPath: string; exists: boolean }>): void {
  // Lock files are already stashed to .pici.backup, so nothing to do here
  // They'll be restored in the finally block
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
  const tempPackageJsonPath = `${packageJsonPath}.pici.temp`;
  const packageLockBackup = stashFile('package-lock.json');
  const yarnLockBackup = stashFile('yarn.lock');
  let packageJsonBackup: ReturnType<typeof stashFile> | null = null;

  try {
    // Create minimal package.json in temp location first
    writePackageJson(tempPackageJsonPath, packages);

    // Only stash original after temp file is successfully created
    packageJsonBackup = stashFile(MAIN_PACKAGE_FILE);

    // Move temp file to final location
    if (fs.existsSync(tempPackageJsonPath)) {
      fs.renameSync(tempPackageJsonPath, packageJsonPath);
    }

    removeLockFiles([packageLockBackup, yarnLockBackup]);
    runNpmInstall(packages);
  } catch (error) {
    // If anything fails, clean up temp file
    if (fs.existsSync(tempPackageJsonPath)) {
      fs.unlinkSync(tempPackageJsonPath);
    }
    throw error;
  } finally {
    // Remove the temporary minimal package.json
    if (fs.existsSync(packageJsonPath)) {
      fs.unlinkSync(packageJsonPath);
    }
    // Clean up temp file if it still exists
    if (fs.existsSync(tempPackageJsonPath)) {
      fs.unlinkSync(tempPackageJsonPath);
    }
    // Restore original files
    if (packageJsonBackup) {
      unstashFile(packageJsonBackup);
    }
    unstashFile(packageLockBackup);
    unstashFile(yarnLockBackup);
  }
}
