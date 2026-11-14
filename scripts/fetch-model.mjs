// Downloads a model file into build/models/, verified against the SHA-256 pinned in desktop/pins.json.
//   node scripts/fetch-model.mjs              (the default: gemma-4-12b)
//   node scripts/fetch-model.mjs gemma-4-e4b  (a smaller one)
// The file is only used by the "full" desktop build, which ships the model inside the app.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { downloadFile } from '../desktop/download.ts';

const pins = JSON.parse(readFileSync(new URL('../desktop/pins.json', import.meta.url), 'utf8'));
const id = process.argv[2] ?? 'gemma-4-12b';
const m = pins.models.find((x) => x.id === id);
if (!m) {
  console.error(`Unknown model "${id}". Choose one of: ${pins.models.map((x) => x.id).join(', ')}`);
  process.exit(1);
}

const url = `https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.file}`;
const dest = path.join('build', 'models', m.file);
console.log(`${m.label}: ${(m.bytes / 1e9).toFixed(2)} GB from ${m.repo} (${m.license})`);

let last = 0;
let phase = 'downloading';
const result = await downloadFile(url, dest, {
  sha256: m.sha256,
  bytes: m.bytes,
  onPhase: (p) => {
    phase = p;
    console.log(p === 'verifying' ? '\nchecking the file...' : 'downloading...');
  },
  onProgress: (done, total) => {
    const now = Date.now();
    if (now - last < 1000 && done !== total) return;
    last = now;
    process.stdout.write(`\r${phase === 'verifying' ? 'checking' : 'downloaded'} ${(done / 1e9).toFixed(2)} / ${((total ?? m.bytes) / 1e9).toFixed(2)} GB   `);
  },
});
console.log(result === 'cached' ? 'Already have a verified copy.' : '\nDone, and the checksum matches.');
console.log(dest);
