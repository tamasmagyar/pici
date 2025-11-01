import * as fs from 'node:fs';
import { spawnSync } from 'child_process';
import { logError, logInfo, logWarn } from './logger';
import { PackageManager } from './types';

export function detectPackageManager(): PackageManager {
  try {
    return fs.existsSync('yarn.lock') ? PackageManager.YARN : PackageManager.NPM;
  } catch {
    logWarn('Failed to check for yarn.lock, falling back to npm');
    return PackageManager.NPM;
  }
}

function getInstallCommand(packageManager: PackageManager): string[] {
  return packageManager === PackageManager.YARN ? ['add'] : ['install'];
}

export function installPackages(packages: string[]): void {
  if (packages.length === 0) {
    logInfo('No packages to install.');
    return;
  }

  const packageManager = detectPackageManager();
  const args = [...getInstallCommand(packageManager), ...packages];

  logInfo(`Installing packages (${packages.join(', ')}) using ${packageManager}...`);
  const result = spawnSync(packageManager, args, { stdio: 'inherit' });

  if (result.error) {
    logError(`Failed to execute ${packageManager}: ${result.error.message}`);
    throw result.error;
  }

  if (result.status !== 0) {
    logError(`Package installation failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}
