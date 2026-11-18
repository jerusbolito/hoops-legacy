/**
 * Playtest report. Plays many whole careers on autopilot with different strategies and archetypes and writes
 * quality-report/playtest.md, flagging dominant strategies and lopsided archetypes.
 *
 *   PLAYTEST=1 npx vitest run src/engine/playtest.test.ts          (30 careers per row)
 *   PLAYTEST=1 PLAYTEST_N=100 npx vitest run src/engine/playtest.test.ts
 *

 * Also writes quality-report/playtest.html (open it in a browser) and appends to playtest-history.json, so the
 * dashboard shows the trend from run to run.
 *
 * It only runs when PLAYTEST is set, so the normal suite stays fast.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import type { Archetype, GameState } from '../state/schemas';
import { createCareer, doSummerTraining, doTraining, userAthlete } from './career';
import { buyService, servicesFor } from './finance';
import { legacyScore, peakOf, scoreParts, tierOf, TIER_LABELS } from './legacyScore';
import type { TrainingFocus } from './progression';
import { RNG } from './rng';
import { renderReport, type Row, type Run } from './playtestReport';
import { tick } from './testkit';

const N = Number(process.env.PLAYTEST_N ?? 30);
const run = process.env.PLAYTEST ? describe : describe.skip;

type Strategy = 'random' | 'shooting-only' | 'rotate' | 'rest-heavy' | 'study-first' | 'spender';
const STRATEGIES: Strategy[] = ['random', 'shooting-only', 'rotate', 'rest-heavy', 'study-first', 'spender'];
const ARCHETYPES: Archetype[] = ['slasher', 'sharpshooter', 'playmaker', 'big', 'two-way'];
const ROTATION: TrainingFocus[] = ['shooting', 'finishing', 'defense', 'passing'];

interface Result {
  score: number;
  peak: number;
  titles: number;
  money: number;
  pro: boolean;
  tier: number;
  seasons: number;
}

function step(s: GameState, rng: RNG, strat: Strategy, n: number) {
  const c = s.career;
  const regular = !c.lifeEvent && c.step === 'training' && (c.phase === 'regular' || c.phase === 'preseason');
  if (regular && strat !== 'random') {
    let focus: TrainingFocus;
    if (strat === 'shooting-only') focus = s.player.energy < 30 ? 'rest' : 'shooting';
    else if (strat === 'rest-heavy') focus = s.player.energy < 70 ? 'rest' : ROTATION[n % 4];
    else if (strat === 'study-first') focus = c.level !== 'pro' && s.player.academics < 3.4 ? 'study' : s.player.energy < 40 ? 'rest' : ROTATION[n % 4];
    else focus = s.player.energy < 40 ? 'rest' : ROTATION[n % 4];
    if (strat === 'spender') for (const svc of servicesFor(s)) buyService(s, svc.id);
    doTraining(s, focus);
    return;
  }
  if (!c.lifeEvent && c.step === 'training' && c.phase === 'offseason' && strat === 'shooting-only') {
    doSummerTraining(s, ['shooting', 'shooting']);
    return;
  }
  if (strat === 'spender' && regular) for (const svc of servicesFor(s)) buyService(s, svc.id);
  tick(s, rng, { moves: true });
}

function career(seed: number, archetype: Archetype, strat: Strategy): Result {
  const s = createCareer({ firstName: 'Play', lastName: `T${seed}`, hometown: 'Akron, OH', archetype, position: archetype === 'big' ? 'C' : archetype === 'playmaker' ? 'PG' : 'SF', heightIn: archetype === 'big' ? 82 : 76, schoolIndex: 0, traits: [], seed });
  const rng = new RNG(seed * 7 + 1);
  let n = 0;
  while (s.career.phase !== 'retired' && n < 20000) step(s, rng, strat, n++);
  const score = legacyScore(s);
  return {
    score,
    peak: peakOf(s),
    titles: scoreParts(s).titles,
    money: s.player.money,
    pro: s.gameLog.some((g) => g.level === 'pro'),
    tier: tierOf(score),
    seasons: new Set(s.gameLog.map((g) => g.season)).size,
  };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const fmt = (x: number, d = 0) => x.toFixed(d);

function toRow(name: string, rs: Result[]): Row {
  const sc = rs.map((r) => r.score);
  return { name, count: rs.length, mean: mean(sc), p10: pct(sc, 0.1), p90: pct(sc, 0.9), peak: mean(rs.map((r) => r.peak)), titles: mean(rs.map((r) => r.titles)), money: mean(rs.map((r) => r.money)), pro: rs.filter((r) => r.pro).length / rs.length, hof: rs.filter((r) => r.tier >= 4).length / rs.length };
}

function row(label: string, rs: Result[]) {
  const sc = rs.map((r) => r.score);
  return `| ${label} | ${fmt(mean(sc), 1)} | ${fmt(pct(sc, 0.1))} / ${fmt(pct(sc, 0.9))} | ${fmt(mean(rs.map((r) => r.peak)), 1)} | ${fmt(mean(rs.map((r) => r.titles)), 2)} | $${fmt(mean(rs.map((r) => r.money)) / 1e6, 1)}M | ${fmt((rs.filter((r) => r.pro).length / rs.length) * 100)}% | ${fmt((rs.filter((r) => r.tier >= 4).length / rs.length) * 100)}% |`;
}

run('playtest report', () => {
  it('plays strategies and archetypes and writes quality-report/playtest.md', () => {
    const byStrat = new Map<Strategy, Result[]>();
    for (const st of STRATEGIES) {
      const rs: Result[] = [];
      for (let i = 0; i < N; i++) rs.push(career(1000 + i, ARCHETYPES[i % ARCHETYPES.length], st));
      byStrat.set(st, rs);
    }
    const byArch = new Map<Archetype, Result[]>();
    for (const a of ARCHETYPES) {
      const rs: Result[] = [];
      for (let i = 0; i < N; i++) rs.push(career(2000 + i, a, 'random'));
      byArch.set(a, rs);
    }

    const head = '| | Mean score | p10 / p90 | Peak OVR | Titles | Final money | Reached pro | HoF+ |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
    const out: string[] = [`# Playtest report`, '', `${N} careers per row, same seeds across strategies. Tiers: ${TIER_LABELS.join(', ')} (HoF+ = Hall of Famer or better).`, '', '## Strategies (mixed archetypes)', '', head];
    for (const st of STRATEGIES) out.push(row(st, byStrat.get(st)!));
    out.push('', '## Archetypes (random strategy)', '', head);
    for (const a of ARCHETYPES) out.push(row(a, byArch.get(a)!));

    const flags: string[] = [];
    const base = mean(byStrat.get('random')!.map((r) => r.score)) || 1;
    for (const st of STRATEGIES) {
      const m = mean(byStrat.get(st)!.map((r) => r.score));
      if (m > base * 1.25) flags.push(`Strategy **${st}** scores ${fmt((m / base - 1) * 100)}% above random: possible dominant strategy.`);
      if (m < base * 0.6) flags.push(`Strategy **${st}** scores ${fmt((1 - m / base) * 100)}% below random: a trap or a broken system.`);
    }
    const am = ARCHETYPES.map((a) => ({ a, m: mean(byArch.get(a)!.map((r) => r.score)) }));
    const hi = am.reduce((x, y) => (y.m > x.m ? y : x));
    const lo = am.reduce((x, y) => (y.m < x.m ? y : x));
    if (hi.m > lo.m * 1.3) flags.push(`Archetype spread: **${hi.a}** (${fmt(hi.m, 1)}) beats **${lo.a}** (${fmt(lo.m, 1)}) by ${fmt((hi.m / lo.m - 1) * 100)}%.`);
    for (const st of STRATEGIES) {
      const rs = byStrat.get(st)!;
      if (rs.every((r) => r.tier >= 4)) flags.push(`Strategy ${st}: every career reached the Hall of Fame. Too easy?`);
      if (rs.every((r) => r.tier === 0)) flags.push(`Strategy ${st}: no career got past Journeyman.`);
    }
    out.push('', '## Flags', '', ...(flags.length ? flags.map((f) => `- ${f}`) : ['- None. Strategies are within 25% of random and archetypes within 30% of each other.']));
    mkdirSync('quality-report', { recursive: true });
    let commit = '';
    try {
      commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      /* not a git checkout */
    }
    const historyFile = 'quality-report/playtest-history.json';
    let history: Run[] = [];
    try {
      if (existsSync(historyFile)) history = JSON.parse(readFileSync(historyFile, 'utf8'));
    } catch {
      history = [];
    }
    history.push({ ts: new Date().toISOString(), commit, n: N, strategies: STRATEGIES.map((st) => toRow(st, byStrat.get(st)!)), archetypes: ARCHETYPES.map((a) => toRow(a, byArch.get(a)!)), flags });
    history = history.slice(-30);
    writeFileSync(historyFile, JSON.stringify(history, null, 1));
    writeFileSync('quality-report/playtest.html', renderReport(history));
    writeFileSync('quality-report/playtest.md', out.join('\n') + '\n');
    console.log(out.join('\n'));
  }, 3_600_000);
});

void userAthlete;
