// Downloads the pinned llama.cpp build for a platform into build/engine/<platform>/<variant>/.
//   node scripts/fetch-engine.mjs            (this computer's platform)
//   node scripts/fetch-engine.mjs win-x64    (a specific one: win-x64, mac-arm64, linux-x64)
// Every file is checked against the SHA-256 pinned in desktop/pins.json before it is used.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadFile } from '../desktop/download.ts';

const pins = JSON.parse(readFileSync(new URL('../desktop/pins.json', import.meta.url), 'utf8'));
const here = `${{ win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform]}-${process.arch}`;
const platform = process.argv[2] ?? here;
const builds = pins.engine.builds[platform];
if (!builds) {
  console.error(`No engine build is pinned for "${platform}". Available: ${Object.keys(pins.engine.builds).join(', ')}`);
  process.exit(1);
}

/**
 * The download holds a dozen other command-line tools (benchmarks, quantizers...). The game only runs llama-server,
 * so the other programs are removed to keep the app small. Libraries are left alone: they may be shared.
 */
function prune(dir, platformName) {
  let removed = 0;
  for (const f of readdirSync(dir)) {
    const win = platformName.startsWith('win');
    const isOtherTool = win ? f.endsWith('.exe') && f !== 'llama-server.exe' : f !== 'llama-server' && /^(llama-|rpc-server|ggml-rpc-server)/.test(f) && !/\.(so|dylib|dll)(\.|$)/.test(f) && statSync(path.join(dir, f)).isFile();
    if (isOtherTool) {
      rmSync(path.join(dir, f));
      removed++;
    }
  }
  return removed;
}

const cache = path.join('build', 'engine', '.downloads');
for (const b of builds) {
  const out = path.join('build', 'engine', platform, b.variant);
  const exe = platform.startsWith('win') ? 'llama-server.exe' : 'llama-server';
  const marker = path.join(out, '.pinned');
  const stamp = `${pins.engine.tag}:${b.sha256}`;
  if (existsSync(path.join(out, exe)) && existsSync(marker) && readFileSync(marker, 'utf8') === stamp) {
    const n = prune(out, platform);
    console.log(`engine ${platform}/${b.variant}: already up to date${n ? ` (removed ${n} unneeded tools)` : ''}`);
    continue;
  }
  const archive = path.join(cache, b.file);
  console.log(`engine ${platform}/${b.variant}: downloading ${b.file} (${(b.bytes / 1e6).toFixed(0)} MB)`);
  await downloadFile(`${pins.engine.source}/${pins.engine.tag}/${b.file}`, archive, { sha256: b.sha256, bytes: b.bytes });

  // unpack into a scratch folder, then move the folder that holds llama-server into place
  const scratch = path.join(os.tmpdir(), `hoops-engine-${process.pid}-${b.variant}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  // Windows ships its own bsdtar, which reads zip and tar.gz. Git's GNU tar (often first on PATH) cannot read zip
  // and mistakes "C:\" for a remote host, so use the system one by path.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', scratch], { stdio: 'inherit' });
  const find = (dir) => {
    if (existsSync(path.join(dir, exe))) return dir;
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) {
        const hit = find(p);
        if (hit) return hit;
      }
    }
    return null;
  };
  const root = find(scratch);
  if (!root) throw new Error(`${exe} was not found inside ${b.file}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.dirname(out), { recursive: true });
  renameSync(root, out);
  rmSync(scratch, { recursive: true, force: true });
  prune(out, platform);
  writeFileSync(marker, stamp);
  console.log(`engine ${platform}/${b.variant}: ready in ${out}`);
}
