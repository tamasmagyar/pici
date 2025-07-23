#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEF = 'package.custom.json', MAIN = 'package.json';
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const read = (f: string): any => JSON.parse(fs.readFileSync(f, 'utf-8'));
const write = (f: string, d: any) => fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');

function getList(file: string, fields = FIELDS) {
  const c = read(path.resolve(file));
  const m = read(path.resolve(MAIN));
  const dependencies: Record<string, string> = c.dependencies || {};
  const mainDeps: Record<string, string> = fields.reduce((a, f) => ({ ...a, ...(m[f] || {}) }), {} as Record<string, string>);
  return Object.entries(dependencies).flatMap(([pkg, v]) => {
    if (typeof v === 'string' && v.trim()) return [`${pkg}@${v}`];
    if (mainDeps[pkg]) return [`${pkg}@${mainDeps[pkg]}`];
    console.warn(`Warning: No version specified for '${pkg}' in custom file and not found in selected fields of main package.json. This package will be skipped.`);
    return [];
  });
}

export { getList as getInstallList, getList };

export function addPackage(pkg: string, file: string = DEF) {
  const f = path.resolve(file);
  const c = fs.existsSync(f) ? read(f) : { dependencies: {} };
  c.dependencies = c.dependencies || {};
  c.dependencies[pkg] = "";
  write(f, c);
}

function run(list: string[]) {
  const yarn = fs.existsSync('yarn.lock');
  const cmd = yarn ? 'yarn' : 'npm', args = yarn ? ['add', ...list] : ['install', ...list];
  spawnSync(cmd, args, { stdio: 'inherit' });
}

function help() {
  console.log(`pici - Minimal custom package installer
Usage:
  pici install [file] [--fields=dependencies,devDependencies]
  pici add <package> [file]
  pici help`);
}

function main() {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || cmd === 'help' || cmd.startsWith('-')) return help();
  if (cmd === 'add') {
    const [pkg, file = DEF] = args;
    if (!pkg) return console.error('Specify a package.');
    const f = path.resolve(file), c = fs.existsSync(f) ? read(f) : { dependencies: {} };
    c.dependencies = c.dependencies || {}; c.dependencies[pkg] = "";
    return write(f, c), console.log(`Added ${pkg} to ${file}`);
  }
  let file = DEF, fields = FIELDS;
  for (const a of [cmd, ...args]) {
    if (a.endsWith('.json')) file = a;
    if (a.startsWith('--fields=')) fields = a.slice(9).split(',').map(f => f.trim());
  }
  const list = getList(file, fields);
  if (!list.length) return console.log('No packages to install.');
  run(list);
}

if (require.main === module) main();