import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadFile, sha256File } from './download';

const DATA = Buffer.alloc(3 * 1024 * 1024 + 123, 0).map((_, i) => (i * 31 + (i >> 8)) & 0xff);
const SHA = createHash('sha256').update(DATA).digest('hex');

interface Srv {
  url: string;
  requests: { range?: string }[];
}
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** A file server like Hugging Face's: supports resuming with Range, unless told not to. */
async function serve(o: { ignoreRange?: boolean; status?: number; slow?: boolean } = {}): Promise<Srv> {
  const requests: Srv['requests'] = [];
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    requests.push({ range });
    if (o.status) return void res.writeHead(o.status).end('nope');
    let start = 0;
    const m = range && !o.ignoreRange ? /bytes=(\d+)-/.exec(range) : null;
    if (m) start = Number(m[1]);
    if (start >= DATA.length) return void res.writeHead(416, { 'Content-Range': `bytes */${DATA.length}` }).end();
    const body = DATA.subarray(start);
    res.writeHead(m ? 206 : 200, { 'Content-Length': body.length, ...(m ? { 'Content-Range': `bytes ${start}-${DATA.length - 1}/${DATA.length}` } : {}) });
    if (!o.slow) return void res.end(body);
    // send in small pieces with gaps, so a download can be interrupted partway
    let at = 0;
    const timer = setInterval(() => {
      if (res.destroyed || at >= body.length) {
        clearInterval(timer);
        if (!res.destroyed) res.end();
        return;
      }
      res.write(body.subarray(at, at + 256 * 1024));
      at += 256 * 1024;
    }, 25);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  cleanups.push(() => new Promise((r) => (server.closeAllConnections(), server.close(() => r()))));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/file.bin`, requests };
}

const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'hoops-dl-')), 'out', 'file.bin');

describe('downloadFile', () => {
  it('downloads a file, checks it, and then does not download it again', async () => {
    const s = await serve();
    const dest = tmp();
    const phases: string[] = [];
    expect(await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length, onPhase: (p) => phases.push(p) })).toBe('downloaded');
    expect(readFileSync(dest).equals(DATA)).toBe(true);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(phases).toEqual(['downloading', 'verifying']);
    const before = s.requests.length;
    expect(await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length })).toBe('cached');
    expect(s.requests.length).toBe(before); // a verified copy means no network at all
  });

  it('reports progress up to the full size', async () => {
    const s = await serve();
    const seen: [number, number | null][] = [];
    await downloadFile(s.url, tmp(), { bytes: DATA.length, onProgress: (d, t) => seen.push([d, t]) });
    expect(seen[seen.length - 1][0]).toBe(DATA.length);
    expect(seen.every(([d, t]) => t === DATA.length && d <= DATA.length)).toBe(true);
    const done = seen.map(([d]) => d);
    expect(done).toEqual([...done].sort((a, b) => a - b));
  });

  it('picks up where an interrupted download stopped', async () => {
    const s = await serve();
    const dest = tmp();
    await downloadFile(s.url, `${dest}.tmp`, {}).catch(() => {}); // make sure the folder exists
    writeFileSync(`${dest}.part`, DATA.subarray(0, 1_000_000));
    await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length });
    expect(s.requests.some((r) => r.range === 'bytes=1000000-')).toBe(true);
    expect(readFileSync(dest).equals(DATA)).toBe(true);
  });

  it('starts over cleanly if the server cannot resume', async () => {
    const s = await serve({ ignoreRange: true });
    const dest = tmp();
    await downloadFile(s.url, `${dest}.tmp`, {}).catch(() => {});
    writeFileSync(`${dest}.part`, DATA.subarray(0, 500_000));
    await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length });
    expect(readFileSync(dest).equals(DATA)).toBe(true); // no duplicated or missing bytes
  });

  it('accepts a partial file that already holds everything', async () => {
    const s = await serve();
    const dest = tmp();
    await downloadFile(s.url, `${dest}.tmp`, {}).catch(() => {});
    writeFileSync(`${dest}.part`, DATA);
    expect(await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length })).toBe('downloaded');
    expect(readFileSync(dest).equals(DATA)).toBe(true);
  });

  it('refuses a file whose checksum is wrong, and deletes it', async () => {
    const s = await serve();
    const dest = tmp();
    await expect(downloadFile(s.url, dest, { sha256: '0'.repeat(64), bytes: DATA.length })).rejects.toThrow(/damaged/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('replaces a file that is there but wrong, rather than trusting it', async () => {
    const s = await serve();
    const dest = tmp();
    await downloadFile(s.url, `${dest}.tmp`, {}).catch(() => {});
    writeFileSync(dest, 'not the real file');
    expect(await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length })).toBe('downloaded');
    expect(readFileSync(dest).equals(DATA)).toBe(true);
  });

  it('says so when the server refuses', async () => {
    const s = await serve({ status: 404 });
    await expect(downloadFile(s.url, tmp(), {})).rejects.toThrow(/Download failed \(404\)/);
  });

  it('can be stopped partway, keeps what it has, and finishes later', async () => {
    const s = await serve({ slow: true });
    const dest = tmp();
    const ctl = new AbortController();
    let sawMid = false;
    const run = downloadFile(s.url, dest, {
      sha256: SHA,
      bytes: DATA.length,
      signal: ctl.signal,
      onProgress: (d) => {
        if (d > 600_000 && !sawMid) {
          sawMid = true;
          ctl.abort();
        }
      },
    });
    await expect(run).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
    const kept = statSync(`${dest}.part`).size;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(DATA.length);
    // later, from the same place
    await downloadFile(s.url, dest, { sha256: SHA, bytes: DATA.length });
    expect(readFileSync(dest).equals(DATA)).toBe(true);
    expect(s.requests.some((r) => r.range === `bytes=${kept}-`)).toBe(true);
  });

  it('notices a download that ended early', async () => {
    const s = await serve();
    await expect(downloadFile(s.url, tmp(), { bytes: DATA.length + 1000 })).rejects.toThrow(/ended early/);
  });
});

describe('sha256File', () => {
  it('matches the known hash and reports progress', async () => {
    const f = tmp();
    const s = await serve();
    await downloadFile(s.url, f, {});
    const steps: number[] = [];
    expect(await sha256File(f, (d) => steps.push(d))).toBe(SHA);
    expect(steps[steps.length - 1]).toBe(DATA.length);
  });
});
