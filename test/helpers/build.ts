import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The end-to-end tests run the compiled CLI, exactly as published. */
export default function build(): void {
  const root = path.resolve(__dirname, '../..');
  fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc')], {
    cwd: root,
    stdio: 'inherit',
  });
  fs.chmodSync(path.join(root, 'dist/index.js'), 0o755);
}
