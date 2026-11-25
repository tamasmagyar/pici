import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveFromCustomFile, resolveFromNames, addPackages } from './package-utils';
import { installPackages } from './package-manager';
import { restoreBackups, withWorkspace } from './restore';
import { DEFAULT_CUSTOM_FILE, DEFAULT_FIELDS } from './constants';
import { logInfo, logSuccess, logError, logWarn, setStderrOnly } from './logger';
import { PiciError, usageError, errorMessage, EXIT_FAILURE } from './errors';
import { formatPackageSpec } from './package-spec';
import type { PackageSpec } from './types';

export const HELP_TEXT = `pici - Minimal custom package installer
Usage:
  pici install [file.json]            Install the packages listed in a custom file
  pici install <package...>           Install packages, versions taken from package.json
  pici <file.json>                    Same as 'pici install <file.json>'
  pici add <package...> [file.json]   Add packages to a custom file
  pici restore                        Recover files after a killed run
  pici help

Options:
  --fields=<a,b>   package.json fields to read versions from, in priority order
  --dry-run        Show what would happen without changing anything
  --json           Print one JSON result to stdout; logs go to stderr
  -h, --help       Show this help
  -v, --version    Show the version

The default custom file is ${DEFAULT_CUSTOM_FILE}.
Exit codes: 0 success, 1 failure, 2 usage error. A failed or interrupted
npm install exits with npm's code, or 128 + the signal number.`;

export type Command = 'install' | 'add' | 'restore' | 'help' | 'version';

export interface ParsedArgs {
  command: Command;
  /** Arguments after the command, excluding options. */
  operands: string[];
  fields: readonly string[];
  json: boolean;
  dryRun: boolean;
}

function parseFields(value: string): string[] {
  const fields = value
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);
  const valid: readonly string[] = DEFAULT_FIELDS;
  const unknown = fields.filter(field => !valid.includes(field));

  if (fields.length === 0 || unknown.length > 0) {
    throw usageError(`Invalid --fields value '${value}'. Choose from: ${valid.join(', ')}`);
  }
  return fields;
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  let fields: readonly string[] = DEFAULT_FIELDS;
  let json = false;
  let dryRun = false;
  let override: Command | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      override = 'help';
    } else if (arg === '--version' || arg === '-v') {
      override = override || 'version';
    } else if (arg === '--fields') {
      fields = parseFields(args[++i] || '');
    } else if (arg.startsWith('--fields=')) {
      fields = parseFields(arg.slice('--fields='.length));
    } else if (arg.startsWith('-')) {
      throw usageError(`Unknown option: ${arg}`);
    } else if (arg) {
      positionals.push(arg);
    }
  }

  const [first, ...rest] = positionals;
  const options = { fields, json, dryRun };

  if (override) {
    return { command: override, operands: [], ...options };
  }
  if (first === undefined) {
    return { command: 'help', operands: [], ...options };
  }
  if (first === 'install' || first === 'add' || first === 'restore' || first === 'help') {
    return { command: first, operands: rest, ...options };
  }
  if (first.endsWith('.json')) {
    return { command: 'install', operands: positionals, ...options };
  }
  throw usageError(`Unknown command: '${first}'. Run 'pici help'.`);
}

export function getVersion(): string {
  const ownPackageJson = path.join(__dirname, '..', 'package.json');
  return JSON.parse(fs.readFileSync(ownPackageJson, 'utf-8')).version;
}

type Result = Record<string, unknown>;

function resolveInstall({ operands, fields }: ParsedArgs): {
  packages: PackageSpec[];
  skipped: string[];
} {
  const files = operands.filter(operand => operand.endsWith('.json'));
  const names = operands.filter(operand => !operand.endsWith('.json'));

  if (files.length > 1 || (files.length > 0 && names.length > 0)) {
    throw usageError('Pass either one custom file or package names, not both.');
  }
  if (names.length > 0) {
    return { packages: resolveFromNames(names, fields), skipped: [] };
  }
  return resolveFromCustomFile(files[0] || DEFAULT_CUSTOM_FILE, fields);
}

function runInstall(args: ParsedArgs): Promise<Result> {
  return withWorkspace(() => resolveAndInstall(args), { readOnly: args.dryRun });
}

async function resolveAndInstall(args: ParsedArgs): Promise<Result> {
  const { packages, skipped } = resolveInstall(args);

  for (const name of skipped) {
    logWarn(
      `No version specified for '${name}' in custom file and not found in selected fields of main package.json. This package will be skipped.`
    );
  }

  if (packages.length === 0) {
    logInfo('No packages to install.');
  } else if (args.dryRun) {
    logInfo(`Would install: ${packages.map(formatPackageSpec).join(', ')}`);
  } else {
    await installPackages(packages, { npmOutputToStderr: args.json });
    logSuccess(`Installed ${packages.length} package(s).`);
  }

  return { packages, skipped };
}

function runAdd({ operands, dryRun }: ParsedArgs): Result {
  const files = operands.filter(operand => operand.endsWith('.json'));
  const names = operands.filter(operand => !operand.endsWith('.json'));

  if (names.length === 0) {
    throw usageError('Specify a package.');
  }
  if (files.length > 1) {
    throw usageError('Specify at most one custom file.');
  }

  const file = files[0] || DEFAULT_CUSTOM_FILE;
  const added = addPackages(names, file, { dryRun });
  const list = added.map(formatPackageSpec).join(', ');

  if (dryRun) {
    logInfo(`Would add ${list} to ${file}`);
  } else {
    logSuccess(`Added ${list} to ${file}`);
  }

  return { file, added };
}

function runRestore({ operands, dryRun }: ParsedArgs): Result {
  if (operands.length > 0) {
    throw usageError("'restore' takes no arguments.");
  }

  const restored = restoreBackups({ dryRun });

  if (restored.length === 0) {
    logInfo('Nothing to restore.');
  } else if (dryRun) {
    logInfo(`Would restore: ${restored.join(', ')}`);
  } else {
    logSuccess(`Restored: ${restored.join(', ')}`);
  }

  return { restored };
}

async function dispatch(args: ParsedArgs): Promise<Result> {
  switch (args.command) {
    case 'install':
      return runInstall(args);
    case 'add':
      return runAdd(args);
    case 'restore':
      return runRestore(args);
    case 'version': {
      const version = getVersion();
      if (!args.json) {
        console.log(version);
      }
      return { version };
    }
    case 'help':
      if (!args.json) {
        logInfo(HELP_TEXT);
      }
      return { help: HELP_TEXT };
  }
}

function printJson(value: Result): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** Runs the CLI and returns the exit code. Never calls process.exit, so cleanup always runs. */
export async function run(argv: readonly string[]): Promise<number> {
  const json = argv.includes('--json');
  let command: Command | null = null;
  setStderrOnly(json);

  try {
    const args = parseArgs(argv);
    command = args.command;
    const result = await dispatch(args);
    if (json) {
      printJson({ ok: true, command, dryRun: args.dryRun, ...result });
    }
    return 0;
  } catch (err) {
    const error =
      err instanceof PiciError ? err : new PiciError('UNEXPECTED', errorMessage(err), EXIT_FAILURE);
    logError(error.message);
    if (json) {
      printJson({
        ok: false,
        command,
        exitCode: error.exitCode,
        error: { code: error.code, message: error.message },
      });
    }
    return error.exitCode;
  } finally {
    setStderrOnly(false);
  }
}

export async function main(): Promise<void> {
  process.exitCode = await run(process.argv.slice(2));
}
