import { getInstallList, addPackage, getPackageVersionFromMain } from './package-utils';
import { installPackages } from './package-manager';
import { DEFAULT_CUSTOM_FILE, DEFAULT_FIELDS } from './constants';
import { logInfo, logSuccess, logError } from './logger';

function printHelp(): void {
  logInfo(`pici - Minimal custom package installer
Usage:
  pici install [file] [--fields=dependencies,devDependencies]
  pici add <package> [file]
  pici help`);
}

export type ParseArgsResult = {
  command: string;
  customFile: string;
  fields: readonly string[];
  packageName?: string;
};

export function parseArgs(args: string[]): ParseArgsResult {
  const command = args[0] || '';
  let customFile = DEFAULT_CUSTOM_FILE;
  let fields: readonly string[] = DEFAULT_FIELDS;
  let packageName: string | undefined;

  const restArgs = args.slice(1);

  // Parse custom file and fields from args
  for (const arg of restArgs) {
    if (arg.endsWith('.json')) {
      customFile = arg;
    } else if (arg.startsWith('--fields=')) {
      fields = arg
        .slice(9)
        .split(',')
        .map(f => f.trim());
    } else if (command === 'install' && !arg.startsWith('--') && !arg.endsWith('.json')) {
      // If install command and arg is not a flag or file, treat as package name
      packageName = arg;
    }
  }

  return { command, customFile, fields, packageName };
}

export function executeCommand(command: string, args: string[]): void {
  if (!command || command === 'help' || command.startsWith('-')) {
    printHelp();
    return;
  }

  if (command === 'add') {
    const [pkg, file = DEFAULT_CUSTOM_FILE] = args;
    if (!pkg) {
      logError('Specify a package.');
      return;
    }

    try {
      addPackage(pkg, file);
      logSuccess(`Added ${pkg} to ${file}`);
    } catch (err) {
      logError(err instanceof Error ? err.message : 'Failed to add package');
      process.exit(1);
    }
    return;
  }

  if (command === 'install') {
    const { customFile, fields, packageName } = parseArgs([command, ...args]);

    // Handle single package installation
    if (packageName) {
      try {
        const version = getPackageVersionFromMain(packageName, fields);
        if (!version) {
          logError(`Package '${packageName}' not found in package.json.`);
          process.exit(1);
        }
        installPackages([`${packageName}@${version}`]);
      } catch (err) {
        logError(err instanceof Error ? err.message : 'Failed to install package');
        process.exit(1);
      }
      return;
    }

    // Handle install from custom file
    try {
      const list = getInstallList(customFile, fields);
      if (list.length === 0) {
        logInfo('No packages to install.');
        return;
      }
      installPackages(list);
    } catch (err) {
      logError(err instanceof Error ? err.message : 'Failed to install packages');
      process.exit(1);
    }
    return;
  }

  // Treat as implicit install command (filename as first arg)
  try {
    const { customFile, fields } = parseArgs([command, ...args]);
    const list = getInstallList(customFile, fields);
    if (list.length === 0) {
      logInfo('No packages to install.');
      return;
    }
    installPackages(list);
  } catch (err) {
    logError(err instanceof Error ? err.message : 'Failed to install packages');
    process.exit(1);
  }
}

export function main(): void {
  const [, , ...args] = process.argv;
  const [command, ...restArgs] = args;
  executeCommand(command || '', restArgs);
}
