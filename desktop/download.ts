import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * A careful file downloader for very large files: it resumes where it left off, reports progress, and checks the
 * result against a known SHA-256 before keeping it. Used by the app (to fetch the model) and by the build scripts.
 * Keep this file to plain, erasable TypeScript with only Node built-ins: Node runs it directly.
 */

export interface DownloadOptions {
  /** Expected SHA-256 (hex). A file that does not match is deleted and reported as damaged. */
  sha256?: string;
  /** Expected size in bytes, used for progress and as a quick check. */
  bytes?: number;
  onProgress?: (done: number, total: number | null) => void;
  /** Called when the download turns into checking the file. */
  onPhase?: (phase: 'downloading' | 'verifying') => void;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export async function sha256File(file: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<string> {
  const total = statSync(file).size;
  const hash = createHash('sha256');
  let done = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024, signal })) {
    hash.update(chunk as Buffer);
    done += (chunk as Buffer).length;
    onProgress?.(done, total);
  }
  return hash.digest('hex');
}

const safeUnlink = (p: string) => {
  try {
    unlinkSync(p);
  } catch {
    /* already gone */
  }
};

/** True if `file` is there and is exactly what we expect. */
async function isGood(file: string, o: DownloadOptions): Promise<boolean> {
  if (!existsSync(file)) return false;
  if (o.bytes !== undefined && statSync(file).size !== o.bytes) return false;
  if (o.sha256) return (await sha256File(file, undefined, o.signal)) === o.sha256.toLowerCase();
  return true;
}

/**
 * Downloads `url` to `dest`. Returns 'cached' if a good copy was already there.
 * An interrupted download is kept as `dest.part` and picked up again next time.
 */
export async function downloadFile(url: string, dest: string, o: DownloadOptions = {}): Promise<'downloaded' | 'cached'> {
  const doFetch = o.fetch ?? fetch;
  mkdirSync(path.dirname(dest), { recursive: true });
  if (await isGood(dest, o)) return 'cached';
  safeUnlink(dest); // present but wrong (or half-written by something else): start over

  const part = `${dest}.part`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let have = existsSync(part) ? statSync(part).size : 0;
    if (o.bytes !== undefined && have > o.bytes) {
      safeUnlink(part);
      have = 0;
    }
    o.onPhase?.('downloading');
    const res = await doFetch(url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, redirect: 'follow', signal: o.signal });

    // the partial file already holds everything: go straight to checking it
    if (res.status === 416) {
      if (o.bytes !== undefined && have === o.bytes) break;
      safeUnlink(part);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) from ${new URL(url).host}.`);

    const resumed = res.status === 206 && have > 0;
    if (!resumed) have = 0; // the server sent the whole file, so start the partial file again
    const length = Number(res.headers.get('content-length') ?? 0);
    const total = o.bytes ?? (length ? have + length : null);
    let done = have;
    o.onProgress?.(done, total);

    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        done += chunk.length;
        o.onProgress?.(done, total);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(part, { flags: resumed ? 'a' : 'w' }), { signal: o.signal });
    break;
  }

  if (o.bytes !== undefined && statSync(part).size !== o.bytes) {
    throw new Error('The download ended early. Try again and it will continue where it stopped.');
  }
  if (o.sha256) {
    o.onPhase?.('verifying');
    const got = await sha256File(part, (d, t) => o.onProgress?.(d, t), o.signal);
    if (got !== o.sha256.toLowerCase()) {
      safeUnlink(part);
      throw new Error('The downloaded file is damaged (its checksum does not match). It has been deleted. Try again.');
    }
  }
  renameSync(part, dest);
  return 'downloaded';
}
