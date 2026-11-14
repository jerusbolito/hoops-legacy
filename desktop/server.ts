import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/**
 * Serves the built game over http://127.0.0.1 inside the desktop app.
 * Why not load the files directly: saves live in the browser's storage, which belongs to an "origin". A fixed local
 * address keeps your saves in the same place every launch, and the local AI engine accepts requests from 127.0.0.1
 * without any special setup.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/** The file a request path maps to, or null if it escapes the folder. Exported for testing. */
export function resolveFile(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export interface StaticServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

/** The first port tried. Saves are tied to the address, so it should almost always be this one. */
export const PREFERRED_PORT = 38417;

export function startStaticServer(root: string, preferredPort = PREFERRED_PORT, attempts = 10): Promise<StaticServer> {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveFile(base, req.url ?? '/');
    if (!file) {
      res.writeHead(400).end('Bad request');
      return;
    }
    // a path with no file extension is a game screen, not a file: hand back the app itself
    let target = file;
    if (!isFile(target)) target = path.extname(file) ? '' : path.join(base, 'index.html');
    if (!target || !isFile(target)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).pipe(res);
  });

  return new Promise((resolve, reject) => {
    let port = preferredPort;
    let tried = 0;
    const listen = () => server.listen(port, '127.0.0.1');
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && tried < attempts) {
        tried++;
        port++;
        listen();
      } else reject(e);
    });
    server.on('listening', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ url: `http://127.0.0.1:${p}`, port: p, close: () => new Promise((r) => server.close(() => r())) });
    });
    listen();
  });
}
