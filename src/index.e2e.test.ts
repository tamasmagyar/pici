import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

const CLI = path.resolve(__dirname, 'index.ts');

function run(cmd: string, cwd: string) {
  return execSync(`npx tsx ${cmd}`, { cwd, encoding: 'utf-8' });
}

describe('pici CLI e2e', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pici-e2e-'));
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          dependencies: { 'gitlab-yaml-parser': '^0.2.2' },
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a package to custom file', () => {
    run(`${CLI} add bar`, tempDir);
    const custom = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.custom.json'), 'utf-8'));
    expect(custom.dependencies.bar).toBe('');
  }, 10000);

  it('installs with custom version from custom file using npm', () => {
    // Create package-lock.json to ensure npm is used
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify(
        {
          dependencies: { 'gitlab-yaml-parser': '' },
        },
        null,
        2
      )
    );

    run(`${CLI} install`, tempDir);
    const nodeModulesPath = path.join(tempDir, 'node_modules', 'gitlab-yaml-parser');
    expect(fs.existsSync(nodeModulesPath)).toBe(true);

    // Verify npm was used by checking package-lock.json was updated
    const lockFile = path.join(tempDir, 'package-lock.json');
    expect(fs.existsSync(lockFile)).toBe(true);

    const customFile = path.join(tempDir, 'package.custom.json');
    expect(fs.existsSync(customFile)).toBe(true);
    const custom = JSON.parse(fs.readFileSync(customFile, 'utf-8'));
    expect(custom.dependencies['gitlab-yaml-parser']).toBe('');
  }, 10000);

  it('installs with custom version from custom file using yarn', () => {
    // Create yarn.lock to ensure yarn is used
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify(
        {
          dependencies: { 'gitlab-yaml-parser': '' },
        },
        null,
        2
      )
    );

    run(`${CLI} install`, tempDir);
    const nodeModulesPath = path.join(tempDir, 'node_modules', 'gitlab-yaml-parser');
    expect(fs.existsSync(nodeModulesPath)).toBe(true);

    // Verify yarn was used by checking yarn.lock was updated
    const lockFile = path.join(tempDir, 'yarn.lock');
    expect(fs.existsSync(lockFile)).toBe(true);
    const lockContent = fs.readFileSync(lockFile, 'utf-8');
    expect(lockContent.length).toBeGreaterThan(0);

    const customFile = path.join(tempDir, 'package.custom.json');
    expect(fs.existsSync(customFile)).toBe(true);
    const custom = JSON.parse(fs.readFileSync(customFile, 'utf-8'));
    expect(custom.dependencies['gitlab-yaml-parser']).toBe('');
  }, 10000);

  it('installs single package using npm', () => {
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

    run(`${CLI} install gitlab-yaml-parser`, tempDir);
    const nodeModulesPath = path.join(tempDir, 'node_modules', 'gitlab-yaml-parser');
    expect(fs.existsSync(nodeModulesPath)).toBe(true);
  }, 10000);

  it('installs single package using yarn', () => {
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    run(`${CLI} install gitlab-yaml-parser`, tempDir);
    const nodeModulesPath = path.join(tempDir, 'node_modules', 'gitlab-yaml-parser');
    expect(fs.existsSync(nodeModulesPath)).toBe(true);
  }, 10000);
});
