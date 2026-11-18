import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { analyzeSource, brief, link, resolveSpec } from './analyze.mjs';

export const DEFAULTS = {
  title: 'Code map',
  include: ['src'],
  ignoreDirs: ['node_modules', 'dist', 'build', 'release', '.git', 'coverage'],
  groups: {},
  flows: [],
  layerChain: null,
  forbid: [],
  docs: [],
  gotchas: [],
  gitCommits: 80,
  /** Paths containing any of these are test support (helpers, fixtures), not part of the project's own code. */
  testPatterns: [],
};

const isTestFile = (rel, extra = []) => /\.(test|spec)\.[mc]?[tj]sx?$/.test(rel) || extra.some((p) => rel.includes(p));
const isSource = (rel) => /\.(ts|tsx|mts)$/.test(rel) && !rel.endsWith('.d.ts');

export function loadTs(root) {
  return createRequire(path.join(root, 'package.json'))('typescript');
}

function walk(root, dir, ignore, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (!ignore.includes(e.name)) walk(root, rel, ignore, out);
    } else if (isSource(rel)) out.push(rel);
  }
  return out;
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** Recent commits with the files each touched, and how often every file has changed. */
export function readGit(root, limit) {
  const raw = git(root, ['log', `-n`, String(Math.max(limit, 400)), '--date=short', '--pretty=format:@@%h|%ad|%s', '--name-only']);
  const commits = [];
  for (const block of raw.split('@@').slice(1)) {
    const [head, ...files] = block.split('\n').map((l) => l.trim());
    const [hash, date, ...subject] = head.split('|');
    commits.push({ hash, date, subject: subject.join('|'), files: files.filter(Boolean) });
  }
  return commits;
}

/**
 * Ownership notes written by hand in a markdown table: `| \`a.ts\`, \`b.ts\` | what they own |`. Returns file name
 * -> text, so the map can say what a file is *for* in the words the team already uses.
 */
export function parseOwnership(docs) {
  const out = {};
  for (const d of docs) {
    for (const line of d.text.split('\n')) {
      const m = line.match(/^\|\s*((?:`[^`|]+`\s*(?:,|\/|and)?\s*)+)\|\s*(.+?)\s*\|\s*$/);
      if (!m) continue;
      const names = [...m[1].matchAll(/`([^`]+\.(?:ts|tsx|mts))`/g)].map((x) => x[1]);
      for (const n of names) out[n] ??= m[2].replace(/`/g, '');
    }
  }
  return out;
}

/** The whole data set the page shows, from files already in memory. */
export function buildData({ ts, files, commits = [], docs = [], config = {}, generatedAt = new Date().toISOString() }) {
  const cfg = { ...DEFAULTS, ...config };
  const isTest = (rel) => isTestFile(rel, cfg.testPatterns);
  const sources = files.filter((f) => !isTest(f.rel));
  const tests = files.filter((f) => isTest(f.rel));
  const analyses = sources.map((f) => analyzeSource(ts, f.rel, f.text));
  const graph = link(analyses);
  const set = new Set(analyses.map((a) => a.rel));

  // which tests cover which file: by import, and by the file-name convention
  const testedBy = {};
  for (const t of tests) {
    const a = analyzeSource(ts, t.rel, t.text);
    const hit = new Set();
    for (const imp of a.imports) {
      const target = resolveSpec(t.rel, imp.spec, set);
      if (target) hit.add(target);
    }
    for (const target of hit) (testedBy[target] ??= []).push(t.rel);
  }

  // commit history per file
  const churn = {};
  const lastChanged = {};
  for (const c of commits) {
    for (const f of c.files) {
      churn[f] = (churn[f] ?? 0) + 1;
      if (!lastChanged[f]) lastChanged[f] = c.date;
    }
  }

  const groupOf = (rel) => {
    const keys = Object.keys(cfg.groups).sort((a, b) => b.length - a.length);
    const k = keys.find((g) => rel === g || rel.startsWith(g + '/'));
    return k ?? path.posix.dirname(rel);
  };

  const ownership = parseOwnership(docs);
  const outFiles = analyses.map((a) => ({
    rel: a.rel,
    name: path.posix.basename(a.rel),
    group: groupOf(a.rel),
    lines: a.lines,
    owns: ownership[path.posix.basename(a.rel)] ?? '',
    doc: brief(a.doc, 240),
    fullDoc: a.doc,
    exports: a.exports.map((e) => ({ ...e })),
    funcs: a.funcs.map((f) => ({ name: f.name, line: f.line, doc: f.doc, exported: f.exported })),
    layer: graph.layers[a.rel],
    fanIn: graph.fanIn[a.rel],
    fanOut: graph.fanOut[a.rel],
    external: graph.external[a.rel] ?? [],
    tests: (testedBy[a.rel] ?? []).sort(),
    churn: churn[a.rel] ?? 0,
    lastChanged: lastChanged[a.rel] ?? '',
  }));

  const keys = Object.keys(cfg.groups);
  const order = (k) => (keys.includes(k) ? keys.indexOf(k) : keys.length);
  const groups = {};
  for (const f of outFiles) {
    const g = (groups[f.group] ??= { key: f.group, title: cfg.groups[f.group]?.title ?? f.group, blurb: cfg.groups[f.group]?.blurb ?? '', files: [] });
    g.files.push(f.rel);
  }

  return {
    title: cfg.title,
    generatedAt,
    files: outFiles,
    // areas appear in the order the config lists them, then anything unlisted by name
    groups: Object.values(groups).sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key)),
    edges: graph.edges,
    calls: graph.callEdges,
    cycles: graph.cycles,
    flows: cfg.flows,
    commits: commits.slice(0, cfg.gitCommits).map((c) => ({ ...c, files: c.files.filter((f) => set.has(f)) })),
    docs,
    gotchas: cfg.gotchas,
    rules: checkRules(cfg, graph, outFiles),
  };
}

/** The architecture rules, checked against what the code actually does. */
export function checkRules(cfg, graph, files) {
  const rules = [];
  rules.push({
    id: 'cycles',
    title: 'No import cycles',
    why: 'Files that import each other (directly or through others) break the load order and usually mean a responsibility is in the wrong place.',
    violations: graph.cycles.map((c) => c.join('  ↔  ')),
  });
  const runtime = graph.edges.filter((e) => !e.type);
  if (cfg.layerChain?.order?.length) {
    const { dir, order, why } = cfg.layerChain;
    const pos = new Map(order.map((n, i) => [`${dir}/${n}.ts`, i]));
    const bad = runtime.filter((e) => pos.has(e.from) && pos.has(e.to) && pos.get(e.to) > pos.get(e.from));
    rules.push({
      id: 'chain',
      title: `Import direction: ${order.join(' ← ')}`,
      why: why ?? 'Each module may import only the ones before it in the chain.',
      violations: bad.map((e) => `${path.posix.basename(e.from)} imports ${path.posix.basename(e.to)}, which comes later in the chain`),
    });
  }
  for (const [i, f] of (cfg.forbid ?? []).entries()) {
    const viol = [];
    if (f.to) for (const e of runtime) if (e.from.startsWith(f.from + '/') && (e.to === f.to || e.to.startsWith(f.to + '/'))) viol.push(`${e.from} imports ${e.to}`);
    if (f.package) for (const file of files) if (file.rel.startsWith(f.from + '/') && file.external.includes(f.package)) viol.push(`${file.rel} imports ${f.package}`);
    rules.push({ id: `forbid-${i}`, title: `${f.from} must not use ${f.to ?? f.package}`, why: f.reason ?? '', violations: viol });
  }
  return rules.map((r) => ({ ...r, ok: r.violations.length === 0 }));
}

/** Reads a project from disk and builds the data set. */
export function scanProject(root, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const ts = loadTs(root);
  const rels = [...new Set(cfg.include.flatMap((d) => walk(root, d, cfg.ignoreDirs)))].sort();
  const files = rels.map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n') }));
  const commits = readGit(root, cfg.gitCommits);
  const docs = [];
  for (const d of cfg.docs) {
    try {
      docs.push({ title: d.title, file: d.file, text: fs.readFileSync(path.join(root, d.file), 'utf8').replace(/\r\n/g, '\n') });
    } catch {
      /* a missing doc is simply not shown */
    }
  }
  return buildData({ ts, files, commits, docs, config: cfg });
}
