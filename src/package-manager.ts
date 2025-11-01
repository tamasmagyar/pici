import { spawnSync } from 'child_process';
import { logError, logInfo } from './logger';

export function installPackages(packages: string[]): void {
  if (packages.length === 0) {
    logInfo('No packages to install.');
    return;
  }

  const args = ['install', '--no-save', ...packages];

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
