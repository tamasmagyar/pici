#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_CUSTOM_FILE = 'package.custom.json';
const MAIN_PACKAGE = 'package.json';

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath: string, data: any) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

type CustomDeps = { dependencies: { [key: string]: string } };

function getInstallList(customFile: string, fields: string[] = ['dependencies', 'devDependencies']) {
  const customPath = path.resolve(process.cwd(), customFile);
  const mainPath = path.resolve(process.cwd(), MAIN_PACKAGE);
  if (!fs.existsSync(customPath)) {
    console.error(`Custom file not found: ${customFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(mainPath)) {
    console.error(`Main package.json not found`);
    process.exit(1);
  }
  const custom: CustomDeps = readJson(customPath);
  const main = readJson(mainPath);
  const customDeps = custom.dependencies || {};
  // Merge selected fields from main package.json
  const mainDeps: Record<string, string> = fields.reduce(
    (acc: Record<string, string>, field) => ({ ...acc, ...(main[field] || {}) }),
    {}
  );
  const installList: string[] = [];
  for (const pkg of Object.keys(customDeps)) {
    const customVersion = customDeps[pkg];
    if (customVersion && customVersion.trim() !== "") {
      installList.push(`${pkg}@${customVersion}`);
      continue;
    }
    const version = mainDeps[pkg];
    if (!version) {
      console.warn(`Warning: ${pkg} not found in selected fields of main package.json`);
      continue;
    }
    installList.push(`${pkg}@${version}`);
  }
  return installList;
}

function runInstall(installList: string[]) {
  const useYarn = fs.existsSync(path.resolve(process.cwd(), 'yarn.lock'));
  const cmd = useYarn ? 'yarn' : 'npm';
  const args = useYarn ? ['add', ...installList] : ['install', ...installList];
  console.log(`Running: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('Install failed:', result.error || result.status);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`pici - Minimal custom package installer\n`);
  console.log(`Usage:`);
  console.log(`  pici install [file] [--fields=dependencies,devDependencies]`);
  console.log(`      Install packages listed in the custom dependencies file (default: package.custom.json)`);
  console.log(`      --fields: Comma-separated list of fields to use from package.json (default: dependencies,devDependencies)`);
  console.log(`  pici add <package> [file]   Add a package to the custom dependencies file (default: package.custom.json)`);
  console.log(`  pici help                   Show this help message`);
}

function main() {
  const [, , cmdOrFile, ...args] = process.argv;
  if (!cmdOrFile || cmdOrFile === 'help' || cmdOrFile === '--help' || cmdOrFile === '-h') {
    printHelp();
    process.exit(0);
  }
  // If the first argument is a file (ends with .json or does not match a known command), treat as install
  const knownCommands = ['install', 'add'];
  if (!knownCommands.includes(cmdOrFile) && cmdOrFile.endsWith('.json')) {
    let file = cmdOrFile;
    let fields = ['dependencies', 'devDependencies'];
    for (const arg of args) {
      if (arg.startsWith('--fields=')) {
        fields = arg.replace('--fields=', '').split(',').map(f => f.trim());
      }
    }
    const installList = getInstallList(file, fields);
    if (installList.length === 0) {
      console.log('No packages to install.');
      return;
    }
    runInstall(installList);
    return;
  }
  if (cmdOrFile === 'install') {
    let file = args[0] || DEFAULT_CUSTOM_FILE;
    let fields = ['dependencies', 'devDependencies'];
    for (const arg of args) {
      if (arg.startsWith('--fields=')) {
        fields = arg.replace('--fields=', '').split(',').map(f => f.trim());
      } else if (arg.endsWith('.json')) {
        file = arg;
      }
    }
    const installList = getInstallList(file, fields);
    if (installList.length === 0) {
      console.log('No packages to install.');
      return;
    }
    runInstall(installList);
    return;
  }
  if (cmdOrFile === 'add') {
    const pkg = args[0];
    const file = args[1] || DEFAULT_CUSTOM_FILE;
    if (!pkg) {
      console.error('Please specify a package to add.');
      process.exit(1);
    }
    const customPath = path.resolve(process.cwd(), file);
    let custom: CustomDeps = { dependencies: {} };
    if (fs.existsSync(customPath)) {
      custom = readJson(customPath);
      if (!custom.dependencies) custom.dependencies = {};
    }
    custom.dependencies[pkg] = "";
    writeJson(customPath, custom);
    console.log(`Added ${pkg} to ${file}`);
    return;
  }
  printHelp();
  process.exit(1);
}

main(); 