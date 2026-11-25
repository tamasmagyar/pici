import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const FAKE_NPM_DIR = path.join(__dirname, 'fake-npm');

export interface NpmCall {
  args: string[];
  /** Contents of every file in the project directory while npm was running. */
  files: Record<string, string>;
}

export function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      files[entry.name] = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
    }
  }
  return files;
}

/** A throwaway directory containing a project, plus a place outside it for test output. */
export function createProject(files: Record<string, unknown> = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pici-test-')));
  const dir = path.join(root, 'project');
  const npmLog = path.join(root, 'npm.log');
  const readyFile = path.join(root, 'npm.ready');
  fs.mkdirSync(dir);

  const resolve = (name: string) => path.join(dir, name);
  const write = (name: string, content: unknown) => {
    fs.mkdirSync(path.dirname(resolve(name)), { recursive: true });
    fs.writeFileSync(
      resolve(name),
      typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
    );
  };
  Object.entries(files).forEach(([name, content]) => write(name, content));

  return {
    dir,
    readyFile,
    resolve,
    write,
    read: (name: string) => fs.readFileSync(resolve(name), 'utf-8'),
    readJson: (name: string) => JSON.parse(fs.readFileSync(resolve(name), 'utf-8')),
    exists: (name: string) => fs.existsSync(resolve(name)),
    snapshot: () => snapshot(dir),
    /** Environment that makes `npm` resolve to the fake one. */
    fakeNpmEnv: (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
      ...process.env,
      PATH: `${FAKE_NPM_DIR}${path.delimiter}${process.env.PATH}`,
      FAKE_NPM_LOG: npmLog,
      FAKE_NPM_READY: readyFile,
      ...extra,
    }),
    npmCalls: (): NpmCall[] =>
      fs.existsSync(npmLog)
        ? fs
            .readFileSync(npmLog, 'utf-8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        : [],
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export type Project = ReturnType<typeof createProject>;

/** Files that must survive every run byte for byte, including unusual formatting. */
export const ORIGINAL_FILES: Record<string, string> = {
  'package.json':
    '{\n\t"name": "precious",\n\t"scripts": { "start": "node ." },\n' +
    '\t"dependencies": { "foo": "^1.0.0", "bar": "~2.0.0" },\n' +
    '\t"devDependencies": { "@scope/dev": "3.0.0" }\n}',
  'package-lock.json': '{"lockfileVersion": 3}\r\n',
  'npm-shrinkwrap.json': '{"lockfileVersion": 3, "shrinkwrap": true}\n',
  'yarn.lock': '# yarn lockfile v1\n\nfoo@^1.0.0:\n  version "1.0.0"\n',
};

export async function waitFor(condition: () => boolean, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(done => setTimeout(done, 20));
  }
}
