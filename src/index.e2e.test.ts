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

  it('restores package.json after installation', () => {
    const originalPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: { 'gitlab-yaml-parser': '^0.2.2' },
    };
    const packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');

    run(`${CLI} install gitlab-yaml-parser`, tempDir);

    // Verify package.json is restored to original
    const restored = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(restored).toEqual(originalPackageJson);
  }, 10000);

  it('restores package-lock.json after installation', () => {
    const originalLockContent = '{"lockfileVersion": 2}\n';
    const lockPath = path.join(tempDir, 'package-lock.json');
    fs.writeFileSync(lockPath, originalLockContent);

    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify({ dependencies: { 'gitlab-yaml-parser': '' } }, null, 2)
    );

    run(`${CLI} install`, tempDir);

    // Verify package-lock.json is restored to original
    const restored = fs.readFileSync(lockPath, 'utf-8');
    expect(restored).toBe(originalLockContent);
  }, 10000);

  it('restores yarn.lock after installation', () => {
    const originalLockContent = '# yarn lockfile v1\n# test content\n';
    const lockPath = path.join(tempDir, 'yarn.lock');
    fs.writeFileSync(lockPath, originalLockContent);

    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify({ dependencies: { 'gitlab-yaml-parser': '' } }, null, 2)
    );

    run(`${CLI} install`, tempDir);

    // Verify yarn.lock is restored to original
    const restored = fs.readFileSync(lockPath, 'utf-8');
    expect(restored).toBe(originalLockContent);
  }, 10000);

  it('restores all files (package.json, package-lock.json, yarn.lock) after installation', () => {
    const originalPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: { 'gitlab-yaml-parser': '^0.2.2' },
    };
    const originalLockContent = '{"lockfileVersion": 2}\n';
    const originalYarnLockContent = '# yarn lockfile v1\n# test\n';

    const packageJsonPath = path.join(tempDir, 'package.json');
    const packageLockPath = path.join(tempDir, 'package-lock.json');
    const yarnLockPath = path.join(tempDir, 'yarn.lock');

    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');
    fs.writeFileSync(packageLockPath, originalLockContent);
    fs.writeFileSync(yarnLockPath, originalYarnLockContent);

    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify({ dependencies: { 'gitlab-yaml-parser': '' } }, null, 2)
    );

    run(`${CLI} install`, tempDir);

    // Verify all files are restored
    const restoredPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(restoredPackageJson).toEqual(originalPackageJson);

    const restoredPackageLock = fs.readFileSync(packageLockPath, 'utf-8');
    expect(restoredPackageLock).toBe(originalLockContent);

    const restoredYarnLock = fs.readFileSync(yarnLockPath, 'utf-8');
    expect(restoredYarnLock).toBe(originalYarnLockContent);
  }, 10000);

  it('installs only specified packages, not all from package.json', () => {
    const originalPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'gitlab-yaml-parser': '^0.2.2',
        lodash: '^4.17.21',
      },
    };
    const packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');

    // Install only gitlab-yaml-parser
    run(`${CLI} install gitlab-yaml-parser`, tempDir);

    // Verify only gitlab-yaml-parser is installed (and its dependencies)
    const nodeModulesPath = path.join(tempDir, 'node_modules');
    expect(fs.existsSync(path.join(nodeModulesPath, 'gitlab-yaml-parser'))).toBe(true);

    // Verify other packages from package.json are NOT installed
    expect(fs.existsSync(path.join(nodeModulesPath, 'lodash'))).toBe(false);

    // Verify package.json is restored
    const restored = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(restored).toEqual(originalPackageJson);
  }, 10000);

  it('installs only packages from custom file, not all from package.json', () => {
    // Create package.json with multiple dependencies
    const originalPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'gitlab-yaml-parser': '^0.2.2',
        lodash: '^4.17.21',
      },
    };
    const packageJsonPath = path.join(tempDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(originalPackageJson, null, 2) + '\n');

    // Create custom file with only gitlab-yaml-parser
    fs.writeFileSync(
      path.join(tempDir, 'package.custom.json'),
      JSON.stringify({ dependencies: { 'gitlab-yaml-parser': '' } }, null, 2)
    );

    run(`${CLI} install`, tempDir);

    // Verify only gitlab-yaml-parser is installed
    const nodeModulesPath = path.join(tempDir, 'node_modules');
    expect(fs.existsSync(path.join(nodeModulesPath, 'gitlab-yaml-parser'))).toBe(true);

    // Verify other packages from package.json are NOT installed
    expect(fs.existsSync(path.join(nodeModulesPath, 'lodash'))).toBe(false);

    // Verify package.json is restored
    const restored = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(restored).toEqual(originalPackageJson);
  }, 10000);
});
