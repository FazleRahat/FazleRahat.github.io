import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ROOT } from '../../scripts/lib/content-files.mjs';

// Raw sockets on purpose: fetch and URL would clean up the malformed targets being tested.
function request(port: number, target: string): Promise<{ status: number; headers: string; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, 'localhost');
    let data = '';
    socket.on('connect', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const [headers = '', body = ''] = data.split('\r\n\r\n');
      resolve({ status: Number(headers.split(' ')[1]), headers, body });
    });
  });
}

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

describe('serve-dist', () => {
  let dir: string;
  let port: number;
  let server: ChildProcess;

  before(async () => {
    mkdirSync(join(ROOT, '.tmp'), { recursive: true });
    dir = mkdtempSync(join(ROOT, '.tmp', 'serve-dist-'));
    mkdirSync(join(dir, 'research'));
    writeFileSync(join(dir, 'index.html'), 'home');
    writeFileSync(join(dir, '404.html'), 'not found page');
    writeFileSync(join(dir, 'research', 'index.html'), 'research');
    writeFileSync(join(dir, 'name.wav'), 'audio');
    port = await freePort();
    server = spawn('node', ['scripts/serve-dist.mjs', '--dir', relative(ROOT, dir), '--port', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => server.stdout!.once('data', resolve));
  });

  after(() => {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves pages, a real 404 and the audio type', async () => {
    assert.equal((await request(port, '/')).body, 'home');
    assert.equal((await request(port, '/research/')).body, 'research');
    const missing = await request(port, '/nope/');
    assert.equal(missing.status, 404);
    assert.equal(missing.body, 'not found page');
    assert.match((await request(port, '/name.wav')).headers, /content-type: audio\/wav/i);
  });

  it('answers a malformed request with 400 and keeps running', async () => {
    for (const target of ['/%', '/%E0%A4%A', '//']) assert.equal((await request(port, target)).status, 400, target);
    assert.equal(server.exitCode, null);
    assert.equal((await request(port, '/')).status, 200);
  });

  it('adds the trailing slash, keeps the query, and never redirects off-site', async () => {
    const plain = await request(port, '/research?area=x');
    assert.equal(plain.status, 301);
    assert.match(plain.headers, /location: \/research\/\?area=x\r?$/im);
    for (const target of ['/%2F%2Fevil.example%2F..%2F..%2Fresearch', '/.//research']) {
      assert.match((await request(port, target)).headers, /location: \/research\/\r?$/im, target);
    }
  });

  it('cannot be made to send an injected header', async () => {
    const response = await request(port, '/x%0d%0aSet-Cookie:%20pwn=1%2f..%2fresearch');
    assert.equal(response.status, 301);
    assert.doesNotMatch(response.headers, /set-cookie/i);
    assert.equal(server.exitCode, null);
  });

  it('never serves a file outside its directory', async () => {
    for (const target of ['/../package.json', '/..%2fpackage.json', '/..%2f..%2f..%2fpackage.json', '/research%2f..%2f..%2f..%2fpackage.json', '/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/index.html%00.png']) {
      const response = await request(port, target);
      assert.equal(response.status, 404, target);
      assert.doesNotMatch(response.body, /rahat-academic-portfolio/, target);
    }
  });
});
