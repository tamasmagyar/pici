import type { DependencyField } from './types';

export const DEFAULT_CUSTOM_FILE = 'package.custom.json';
export const MAIN_PACKAGE_FILE = 'package.json';
export const DEFAULT_FIELDS: readonly DependencyField[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/** Lock files that are moved out of the way while npm runs. */
export const LOCK_FILES: readonly string[] = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
];

export const BACKUP_SUFFIX = '.pici.backup';
export const TEMP_SUFFIX = '.pici.temp';
export const PROCESS_LOCK_FILE = '.pici.lock';
export const TEMP_PACKAGE_NAME = 'pici-temp';

export const NPM_INSTALL_ARGS: readonly string[] = [
  'install',
  '--package-lock=false',
  '--no-audit',
  '--no-fund',
  '--legacy-peer-deps',
];
