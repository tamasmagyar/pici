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
/** Property that identifies JSON files written by pici. */
export const TEMP_MARKER = 'piciTemp';
/** First line of a yarn.lock written by pici. */
export const TEMP_YARN_HEADER = '# pici-temp\n';

/**
 * `--no-save` stops npm from writing lock files; `--package-lock` makes it read the
 * temporary one even if the user's npm configuration turns lock files off.
 */
export const NPM_INSTALL_ARGS: readonly string[] = [
  'install',
  '--no-save',
  '--package-lock',
  '--no-audit',
  '--no-fund',
  '--legacy-peer-deps',
];
