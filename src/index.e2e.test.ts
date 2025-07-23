import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const CLI = path.resolve(__dirname, 'index.ts');

function run(cmd: string, cwd: string) {
  return execSync(`npx tsx ${cmd}`, { cwd, encoding: 'utf-8' });
}

describe('pici CLI e2e', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pici-e2e-'));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { foo: '1.2.3' }
    }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a package to custom file', () => {
    run(`${CLI} add bar`, tempDir);
    const custom = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.custom.json'), 'utf-8'));
    expect(custom.dependencies.bar).toBe('');
  });

  it('installs with custom version from custom file', () => {
    fs.writeFileSync(path.join(tempDir, 'package.custom.json'), JSON.stringify({
      dependencies: { foo: '1.2.3' }
    }, null, 2));
    run(`${CLI} install`, tempDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.foo).toBe('1.2.3');
  });
});
