#!/usr/bin/env node
// Builds the code map for a project and writes one HTML file.
//   node tools/codemap/src/cli.mjs [--root .] [--config path] [--out codemap-out/index.html] [--open] [--strict]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './render.mjs';
import { scanProject } from './scan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const root = path.resolve(opt('root', process.cwd()));
const configPath = path.resolve(root, opt('config', fs.existsSync(path.join(root, 'codemap.config.json')) ? 'codemap.config.json' : path.join(here, '..', 'codemap.config.json')));
const out = path.resolve(root, opt('out', 'codemap-out/index.html'));

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error(`Could not read the config at ${configPath}: ${e.message}`);
  process.exit(1);
}

const started = Date.now();
const data = scanProject(root, config);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderPage(data));

const lines = data.files.reduce((n, f) => n + f.lines, 0);
console.log(`Code map: ${data.files.length} files, ${lines.toLocaleString()} lines, ${data.edges.length} imports, ${data.calls.length} calls, ${data.commits.length} commits (${Date.now() - started} ms)`);
console.log(`Wrote ${out}`);

const fnIds = new Set(data.files.flatMap((f) => f.funcs.map((fn) => `${f.rel}#${fn.name}`)));
const missing = data.flows.filter((f) => !fnIds.has(f.entry));
for (const f of missing) console.warn(`  Flow "${f.title}" points at ${f.entry}, which no longer exists. Update the config.`);
const broken = data.rules.filter((r) => !r.ok);
for (const r of broken) {
  console.warn(`  RULE BROKEN: ${r.title}`);
  for (const v of r.violations.slice(0, 8)) console.warn(`    - ${v}`);
}
if (!broken.length) console.log(`  All ${data.rules.length} rules pass.`);

if (args.includes('--open')) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', out]] : process.platform === 'darwin' ? ['open', [out]] : ['xdg-open', [out]];
  spawnSync(cmd[0], cmd[1], { stdio: 'ignore' });
}
process.exit(args.includes('--strict') && (broken.length || missing.length) ? 1 : 0);
