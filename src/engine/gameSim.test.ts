import { describe, expect, it } from 'vitest';
import { LEVEL_CONFIG } from '../data/teams';
import type { Level, TeamBox } from '../state/schemas';
import { GameSim, type SimOptions } from './gameSim';
import { generateLeagueTeams } from './generate';
import { RNG } from './rng';

function setup(level: Level, seed = 42) {
  const rng = new RNG(seed);
  const { teams, athletes } = generateLeagueTeams(rng, level);
  const byTeam = (i: number) => ({
    teamId: teams[i].id,
    abbrev: teams[i].abbrev,
    roster: athletes.filter((a) => a.teamId === teams[i].id),
  });
  const cfg = LEVEL_CONFIG[level];
  const opts: SimOptions = { quarterMinutes: cfg.quarterMinutes, levelMean: cfg.ratingMean, pace: cfg.pace, foulOut: 5, keyMoments: false };
  return { rng, home: byTeam(0), away: byTeam(1), opts };
}

function checkBox(t: TeamBox) {
  const pts = t.players.reduce((s, p) => s + p.pts, 0);
  expect(pts).toBe(t.score);
  expect(t.quarters.reduce((a, b) => a + b, 0)).toBe(t.score);
  for (const p of t.players) {
    expect(p.pts).toBe(2 * (p.fgm - p.tpm) + 3 * p.tpm + p.ftm);
    expect(p.fgm).toBeLessThanOrEqual(p.fga);
    expect(p.tpm).toBeLessThanOrEqual(p.tpa);
    expect(p.tpa).toBeLessThanOrEqual(p.fga);
    expect(p.ftm).toBeLessThanOrEqual(p.fta);
  }
}

describe('GameSim', () => {
  for (const level of ['hs', 'college', 'pro'] as Level[]) {
    it(`box scores are internally consistent (${level})`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const { rng, home, away, opts } = setup(level, seed);
        const box = new GameSim(rng, home, away, opts).runToEnd();
        checkBox(box.home);
        checkBox(box.away);
        expect(box.home.score).not.toBe(box.away.score);
        // 5 players on court for the whole game
        const totalSec = box.home.players.reduce((s, p) => s + p.sec, 0);
        const regSec = opts.quarterMinutes * 60 * 4 * 5;
        expect(totalSec).toBeGreaterThanOrEqual(regSec - 10);
      }
    });
  }

  it('produces realistic scoring ranges', () => {
    const scores: Record<Level, number[]> = { hs: [], college: [], pro: [] };
    for (const level of ['hs', 'college', 'pro'] as Level[]) {
      for (let seed = 1; seed <= 40; seed++) {
        const { rng, home, away, opts } = setup(level, seed);
        const box = new GameSim(rng, home, away, opts).runToEnd();
        scores[level].push(box.home.score, box.away.score);
      }
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(scores.hs)).toBeGreaterThan(40);
    expect(avg(scores.hs)).toBeLessThan(75);
    expect(avg(scores.college)).toBeGreaterThan(58);
    expect(avg(scores.college)).toBeLessThan(88);
    expect(avg(scores.pro)).toBeGreaterThan(95);
    expect(avg(scores.pro)).toBeLessThan(125);
  });

  it('is deterministic for a seed', () => {
    const a = setup('hs', 7);
    const b = setup('hs', 7);
    const ba = new GameSim(a.rng, a.home, a.away, a.opts).runToEnd();
    const bb = new GameSim(b.rng, b.home, b.away, b.opts).runToEnd();
    expect(ba).toEqual(bb);
  });

  it('surfaces key moments for the user and keeps the box consistent', () => {
    const { rng, home, away, opts } = setup('hs', 3);
    const userId = home.roster[0].id;
    const sim = new GameSim(rng, home, away, { ...opts, keyMoments: true, userAthleteId: userId });
    let moments = 0;
    for (;;) {
      const st = sim.step();
      if (st.type === 'final') break;
      moments++;
      expect(st.moment.options.length).toBeGreaterThanOrEqual(3);
      for (const o of st.moment.options) {
        expect(o.odds).toBeGreaterThan(0);
        expect(o.odds).toBeLessThan(1);
      }
      sim.resolveMoment(st.moment.options[0].id);
    }
    expect(moments).toBeGreaterThanOrEqual(2);
    const box = sim.boxScore();
    checkBox(box.home);
    checkBox(box.away);
  });
});
