import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFile, startStaticServer, type StaticServer } from './server';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function site() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'hoops-site-'));
  const root = path.join(parent, 'dist');
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Hoops</title>');
  writeFileSync(path.join(root, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(path.join(root, 'assets', 'font.woff2'), 'x');
  writeFileSync(path.join(parent, 'secret.txt'), 'top secret');
  return { root, parent };
}

async function serve(root: string, port?: number): Promise<StaticServer> {
  const s = await startStaticServer(root, port ?? 0);
  cleanups.push(() => s.close());
  return s;
}

async function get(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), text: await r.text() };
}

describe('resolveFile', () => {
  const root = path.resolve('/srv/site');
  it('maps ordinary paths inside the folder', () => {
    expect(resolveFile(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'));
    expect(resolveFile(root, '/')).toBe(root);
    expect(resolveFile(root, '/a/../assets/app.js?v=1#x')).toBe(path.join(root, 'assets', 'app.js'));
  });
  it('never leaves the folder, however the path is disguised', () => {
    for (const bad of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/a/%2e%2e/%2e%2e/etc/passwd', '/%00', '/%E0%A4%A']) {
      const r = resolveFile(root, bad);
      if (r !== null) expect(path.relative(root, r).startsWith('..')).toBe(false);
    }
    expect(resolveFile(root, '/%00')).toBeNull();
    expect(resolveFile(root, '/%E0%A4%A')).toBeNull();
  });
});

describe('static server', () => {
  it('serves the app, with the right types, and long caching only for hashed assets', async () => {
    const { root } = site();
    const s = await serve(root);
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const index = await get(`${s.url}/`);
    expect(index).toMatchObject({ status: 200, type: 'text/html; charset=utf-8', cache: 'no-cache' });
    expect(index.text).toContain('Hoops');
    const js = await get(`${s.url}/assets/app.js`);
    expect(js.type).toMatch(/javascript/);
    expect(js.cache).toMatch(/immutable/);
    expect((await get(`${s.url}/assets/font.woff2`)).type).toBe('font/woff2');
  });

  it('hands the app back for game screens, and 404s for missing files', async () => {
    const { root } = site();
    const s = await serve(root);
    expect((await get(`${s.url}/some/screen`)).text).toContain('Hoops');
    expect((await get(`${s.url}/missing.png`)).status).toBe(404);
    expect((await get(`${s.url}/assets/nope.js`)).status).toBe(404);
  });

  it('cannot be tricked into reading files outside the game', async () => {
    const { root } = site();
    const s = await serve(root);
    // raw requests, because fetch would tidy the dots away before sending
    const raw = (p: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: s.port, path: p }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        }).on('error', reject);
      });
    for (const p of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/..%5csecret.txt']) {
      const r = await raw(p);
      expect(r.body).not.toContain('top secret');
    }
  });

  it('only answers reads', async () => {
    const { root } = site();
    const s = await serve(root);
    expect((await get(`${s.url}/`, { method: 'POST', body: 'x' })).status).toBe(405);
    expect((await get(`${s.url}/`, { method: 'HEAD' })).status).toBe(200);
  });

  it('moves to the next port if the usual one is busy', async () => {
    const { root } = site();
    const a = await serve(root);
    const b = await startStaticServer(root, a.port, 5);
    cleanups.push(() => b.close());
    // the next free port above the busy one (the very next might also be taken by something else)
    expect(b.port).toBeGreaterThan(a.port);
    expect(b.port).toBeLessThanOrEqual(a.port + 5);
    expect((await get(`${b.url}/`)).status).toBe(200);
  });
});
