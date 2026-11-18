import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource, brief, resolveSpec } from '../src/analyze.mjs';
import { buildData } from '../src/scan.mjs';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');

const F = (rel, text) => ({ rel, text });
const project = [
  F('src/engine/rng.ts', `/** Seeded random numbers. Everything random goes through here. */\nexport class RNG {\n  next() { return this.step(); }\n  private step() { return 1; }\n}\nexport const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));\n`),
  F('src/engine/finance.ts', `import { clamp } from './rng';\n\n/** What a week pays. */\nexport function weeklyPay(n: number) {\n  return clamp(n, 0, 100);\n}\n`),
  F('src/engine/career.ts', `import { weeklyPay } from './finance';\nimport * as rng from './rng';\nimport { RNG } from './rng';\nimport { helper } from './index';\nimport { bad } from './news';\n\n/** Moves the calendar forward one week. */\nexport function advanceWeek() {\n  const r = new RNG();\n  r.next();\n  settle();\n  helper();\n  void bad;\n  return weeklyPay(5) + rng.clamp(1, 0, 2);\n}\n\nfunction settle() {\n  return weeklyPay(1);\n}\n`),
  F('src/engine/index.ts', `export { weeklyPay as helper } from './finance';\n`),
  F('src/engine/news.ts', `import { advanceWeek } from './career';\nexport const bad = () => advanceWeek();\n`),
  F('src/ui/Panel.tsx', `import { advanceWeek } from '../engine/career';\nimport { useState } from 'react';\nexport function Panel() {\n  useState(0);\n  advanceWeek();\n  return <Card />;\n}\nfunction Card() {\n  return <div />;\n}\n`),
  F('src/engine/rng.test.ts', `import { RNG } from './rng';\nimport { weeklyPay } from './finance';\n`),
];

describe('analyzeSource', () => {
  it('finds exports with their doc comments, and the file description', () => {
    const a = analyzeSource(ts, 'src/engine/rng.ts', project[0].text);
    expect(a.exports.map((e) => [e.name, e.kind])).toEqual([['RNG', 'class'], ['clamp', 'function']]);
    expect(a.doc).toMatch(/Seeded random numbers/);
    expect(a.funcs.map((f) => f.name)).toEqual(['RNG', 'RNG.next', 'RNG.step', 'clamp']);
  });

  it('records what each function calls, including methods, constructors and components', () => {
    const c = analyzeSource(ts, 'src/engine/career.ts', project[2].text).funcs.find((f) => f.name === 'advanceWeek');
    expect(c.calls).toEqual(expect.arrayContaining([{ k: 'id', name: 'RNG' }, { k: 'id', name: 'settle' }, { k: 'id', name: 'weeklyPay' }, { k: 'ns', ns: 'rng', name: 'clamp' }]));
    const ui = analyzeSource(ts, 'src/ui/Panel.tsx', project[5].text).funcs.find((f) => f.name === 'Panel');
    expect(ui.calls).toContainEqual({ k: 'id', name: 'Card' });
  });

  it('tells types from values and keeps re-exports', () => {
    const a = analyzeSource(ts, 'x.ts', `import type { A } from './a';\nimport { type B, c } from './b';\nexport { d as e } from './d';\nexport * from './f';\n`);
    expect(a.imports[0].typeOnly).toBe(true);
    expect(a.imports[1].typeOnly).toBe(false);
    expect(a.reexports).toEqual([{ spec: './d', name: 'e', imported: 'd' }, { spec: './f', star: true }]);
  });
});

describe('resolveSpec', () => {
  const set = new Set(['src/a/b.ts', 'src/a/c/index.ts', 'src/a/d.tsx']);
  it('resolves files, folders and extensions, and ignores packages', () => {
    expect(resolveSpec('src/a/x.ts', './b', set)).toBe('src/a/b.ts');
    expect(resolveSpec('src/a/x.ts', './c', set)).toBe('src/a/c/index.ts');
    expect(resolveSpec('src/a/x.ts', './d.js', set)).toBe('src/a/d.tsx');
    expect(resolveSpec('src/a/x.ts', '../a/b', set)).toBe('src/a/b.ts');
    expect(resolveSpec('src/a/x.ts', 'react', set)).toBeNull();
    expect(resolveSpec('src/a/x.ts', './missing', set)).toBeNull();
  });
});

describe('buildData', () => {
  const data = buildData({
    ts,
    files: project,
    commits: [
      { hash: 'a1', date: '2026-11-02', subject: 'add pay', files: ['src/engine/finance.ts', 'src/engine/career.ts'] },
      { hash: 'b2', date: '2026-11-01', subject: 'start', files: ['src/engine/finance.ts', 'README.md'] },
    ],
    config: {
      groups: { 'src/engine': { title: 'Engine', blurb: 'rules' } },
      flows: [{ title: 'A week', entry: 'src/engine/career.ts#advanceWeek' }],
      layerChain: { dir: 'src/engine', order: ['rng', 'finance', 'news', 'career'] },
      forbid: [{ from: 'src/engine', to: 'src/ui' }, { from: 'src/engine', package: 'react' }],
    },
  });
  const file = (rel) => data.files.find((f) => f.rel === rel);

  it('lists source files only, and attaches the tests that cover them', () => {
    expect(data.files.map((f) => f.rel)).not.toContain('src/engine/rng.test.ts');
    expect(file('src/engine/rng.ts').tests).toEqual(['src/engine/rng.test.ts']);
    expect(file('src/engine/finance.ts').tests).toEqual(['src/engine/rng.test.ts']);
    expect(file('src/engine/career.ts').tests).toEqual([]);
  });

  it('builds import edges, through re-exports and namespaces', () => {
    const pairs = data.edges.map((e) => `${e.from}>${e.to}`);
    expect(pairs).toContain('src/engine/finance.ts>src/engine/rng.ts');
    expect(pairs).toContain('src/ui/Panel.tsx>src/engine/career.ts');
    expect(file('src/ui/Panel.tsx').external).toEqual(['react']);
  });

  it('builds a call graph that follows names across files', () => {
    const calls = data.calls.map((c) => `${c.from} -> ${c.to}`);
    expect(calls).toContain('src/engine/career.ts#advanceWeek -> src/engine/career.ts#settle');
    expect(calls).toContain('src/engine/career.ts#advanceWeek -> src/engine/finance.ts#weeklyPay');
    expect(calls).toContain('src/engine/career.ts#advanceWeek -> src/engine/rng.ts#RNG');
    expect(calls).toContain('src/engine/career.ts#advanceWeek -> src/engine/rng.ts#clamp'); // rng.clamp(...) through the namespace
    expect(calls).toContain('src/engine/career.ts#advanceWeek -> src/engine/finance.ts#weeklyPay'); // helper() re-exported under another name
    expect(calls).toContain('src/engine/rng.ts#RNG.next -> src/engine/rng.ts#RNG.step'); // this.step()
    expect(calls).toContain('src/ui/Panel.tsx#Panel -> src/ui/Panel.tsx#Card');
  });

  it('puts foundations in low layers and entry points in high ones', () => {
    expect(file('src/engine/rng.ts').layer).toBe(0);
    expect(file('src/engine/finance.ts').layer).toBeLessThan(file('src/engine/career.ts').layer);
    expect(file('src/ui/Panel.tsx').layer).toBeGreaterThan(file('src/engine/career.ts').layer);
  });

  it('finds import cycles and rule violations', () => {
    expect(data.cycles).toEqual([['src/engine/career.ts', 'src/engine/news.ts']]);
    const rule = (id) => data.rules.find((r) => r.id === id);
    expect(rule('cycles').ok).toBe(false);
    expect(rule('chain').ok).toBe(false);
    expect(rule('chain').violations[0]).toMatch(/career.ts imports|news.ts imports/);
    expect(rule('forbid-0').ok).toBe(true); // engine does not import ui
    expect(rule('forbid-1').ok).toBe(true); // engine does not use react
  });

  it('counts how often each file changed and when', () => {
    expect(file('src/engine/finance.ts').churn).toBe(2);
    expect(file('src/engine/finance.ts').lastChanged).toBe('2026-11-02');
    expect(file('src/engine/news.ts').churn).toBe(0);
    expect(data.commits[0].files).toEqual(['src/engine/finance.ts', 'src/engine/career.ts']); // README is not a source file
  });

  it('groups files with the configured titles', () => {
    expect(data.groups[0]).toMatchObject({ key: 'src/engine', title: 'Engine', blurb: 'rules' });
  });
});

describe('brief', () => {
  it('cuts to the first sentence and never runs on', () => {
    expect(brief('Moves the calendar forward. Then does other things.')).toBe('Moves the calendar forward.');
    expect(brief('x'.repeat(500)).length).toBeLessThanOrEqual(200);
    expect(brief('')).toBe('');
  });
});

import { parseOwnership } from '../src/scan.mjs';

describe('file descriptions', () => {
  it('uses a detached top-level comment, never one from inside a declaration', () => {
    const a = analyzeSource(ts, 'a.ts', `import x from './x';\n\n/**\n * Real file description. More.\n */\n\nexport interface I {\n  /** A field comment that must not become the file description. */\n  f: string;\n}\n`);
    expect(a.doc).toBe('Real file description. More.');
    const b = analyzeSource(ts, 'b.ts', `export interface I {\n  /** A field comment. */\n  f: string;\n}\n`);
    expect(b.doc).toBe('');
  });

  it('falls back to comment lines at the very top of a script', () => {
    expect(analyzeSource(ts, 's.mjs.ts', `// Runs the playtest\n// and opens the dashboard.\nimport a from 'a';\n`).doc).toBe('Runs the playtest and opens the dashboard.');
  });

  it('reads ownership tables, including rows that name several files', () => {
    const own = parseOwnership([{ text: '| File | Owns |\n| --- | --- |\n| `career.ts` | calendar, creation |\n| `gameSim.ts`, `league.ts` | possession sim, schedule |\n| not a file | nope |\n' }]);
    expect(own).toEqual({ 'career.ts': 'calendar, creation', 'gameSim.ts': 'possession sim, schedule', 'league.ts': 'possession sim, schedule' });
  });
});
