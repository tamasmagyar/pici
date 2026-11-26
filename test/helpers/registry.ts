import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';

export interface FakePackage {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

function pack(manifest: FakePackage): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pici-registry-'));
  try {
    fs.mkdirSync(path.join(dir, 'package'));
    fs.writeFileSync(path.join(dir, 'package/package.json'), JSON.stringify(manifest));
    execFileSync('tar', ['-czf', 'package.tgz', 'package'], { cwd: dir });
    return fs.readFileSync(path.join(dir, 'package.tgz'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A minimal npm registry on localhost, so real npm can be tested without internet access. */
export async function startRegistry(packages: FakePackage[]) {
  const tarballs = new Map<string, Buffer>();
  const base = (name: string) => name.slice(name.indexOf('/') + 1);
  for (const manifest of packages) {
    tarballs.set(
      `/${manifest.name}/-/${base(manifest.name)}-${manifest.version}.tgz`,
      pack(manifest)
    );
  }

  const server = http.createServer((request, response) => {
    const url = decodeURIComponent(request.url || '');
    const tarball = tarballs.get(url);
    if (tarball) {
      response.end(tarball);
      return;
    }
    const versions = packages.filter(manifest => `/${manifest.name}` === url);
    if (versions.length === 0) {
      response.writeHead(404).end('{}');
      return;
    }
    const origin = `http://${request.headers.host}`;
    const entries = versions.map(manifest => {
      const file = `/${manifest.name}/-/${base(manifest.name)}-${manifest.version}.tgz`;
      const hash = crypto.createHash('sha512').update(tarballs.get(file)!).digest('base64');
      const dist = { tarball: origin + file, integrity: `sha512-${hash}` };
      return [manifest.version, { ...manifest, dist }];
    });
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        name: versions[0].name,
        'dist-tags': { latest: versions[versions.length - 1].version },
        versions: Object.fromEntries(entries),
      })
    );
  });

  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise(done => server.close(done)),
  };
}
