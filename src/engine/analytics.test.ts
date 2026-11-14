import { describe, expect, it } from 'vitest';
import type { GameLogEntry, GameState, PlayerLine } from '../state/schemas';
import { advanceWeek, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame } from './career';
import { advancedLine, consistency, formSeries, percentile, playerRows, splits, teamAnalytics, userPercentiles } from './analytics';

const line = (o: Partial<PlayerLine> = {}): PlayerLine => ({ athleteId: 'a', sec: 1800, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, ...o });
const entry = (l: PlayerLine, won = true, playoff = false): GameLogEntry => ({
  gameId: Math.random().toString(),
  season: 1,
  level: 'hs',
  year: 1,
  week: 1,
  teamId: 't',
  oppId: 'o',
  teamScore: won ? 60 : 50,
  oppScore: won ? 50 : 60,
  playoff,
  line: l,
});

describe('advancedLine', () => {
  it('computes true shooting, eFG and rates from known totals', () => {
    // 10/20 FG with 4 threes (of 8), 5/6 FT => 29 pts
    const e = entry(line({ pts: 29, fgm: 10, fga: 20, tpm: 4, tpa: 8, ftm: 5, fta: 6, ast: 6, tov: 3, sec: 2160 }));
    const a = advancedLine([e]);
    expect(a.ts).toBeCloseTo(29 / (2 * (20 + 0.44 * 6)), 5);
    expect(a.efg).toBeCloseTo((10 + 0.5 * 4) / 20, 5);
    expect(a.threeRate).toBeCloseTo(0.4, 5);
    expect(a.astTov).toBeCloseTo(2, 5);
    expect(a.per36.pts).toBeCloseTo(29 * (36 / 36), 5); // 36 minutes played
  });

  it('does not divide by zero with no games', () => {
    const a = advancedLine([]);
    expect(a.ts).toBe(0);
    expect(a.per36.pts).toBe(0);
    expect(a.astTov).toBe(0);
  });

  it('counts double-doubles and 20-point games', () => {
    const a = advancedLine([entry(line({ pts: 22, drb: 10 })), entry(line({ pts: 8 })), entry(line({ pts: 12, drb: 5, ast: 11, stl: 10 }))]);
    expect(a.doubleDoubles).toBe(2);
    expect(a.tripleDoubles).toBe(1);
    expect(a.twentyPlus).toBe(1);
  });
});

describe('form and splits', () => {
  it('builds a rolling average and ignores games where the player did not play', () => {
    const log = [entry(line({ pts: 10 })), entry(line({ pts: 20, fgm: 8, fga: 10 })), entry(line({ sec: 0 }))];
    const s = formSeries(log, 2);
    expect(s).toHaveLength(2);
    expect(s[1].rolling).toBeCloseTo((s[0].gmsc + s[1].gmsc) / 2, 5);
  });

  it('separates wins and losses', () => {
    const sp = splits([entry(line({ pts: 20 }), true), entry(line({ pts: 10 }), false)]);
    expect(sp.find((s) => s.label === 'Wins')!.ppg).toBe(20);
    expect(sp.find((s) => s.label === 'Losses')!.ppg).toBe(10);
    expect(sp.find((s) => s.label === 'Playoffs')).toBeUndefined();
  });

  it('labels consistency', () => {
    const flat = Array.from({ length: 8 }, () => entry(line({ pts: 12, fgm: 5, fga: 10 })));
    expect(consistency(formSeries(flat)).label).toBe('Metronome');
    expect(consistency(formSeries(flat.slice(0, 2))).label).toBe('Not enough games');
  });
});

describe('percentile', () => {
  it('handles ties and extremes', () => {
    expect(percentile([1, 2, 3, 4], 4)).toBe(88);
    expect(percentile([1, 2, 3, 4], 1)).toBe(13);
    expect(percentile([5, 5, 5, 5], 5)).toBe(50);
    expect(percentile([], 3)).toBe(0);
  });
});

describe('league analytics on a real season', () => {
  function playSeason(): GameState {
    const s = createCareer({ firstName: 'Test', lastName: 'Player', hometown: 'Oakland, CA', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: ['clutch'], seed: 42 });
    let ticks = 0;
    while (s.career.season === 1 && s.career.phase !== 'offseason' && ticks < 3000) {
      const c = s.career;
      if (c.step === 'training') (c.phase === 'offseason' ? doSummerTraining(s, ['shooting', 'finishing']) : doTraining(s, s.player.energy < 40 ? 'rest' : 'shooting'));
      else if (c.step === 'scene') completeScene(s);
      else if (c.step === 'game') {
        const g = createUserGameSim(s)!;
        g.sim.runToEnd();
        finishUserGame(s, g.sim, g.game);
      } else advanceWeek(s);
      ticks++;
    }
    return s;
  }

  it('produces sane player rows, percentiles and team analytics', () => {
    const s = playSeason();
    const rows = playerRows(s, 2);
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.some((r) => r.isUser)).toBe(true);
    for (const r of rows) {
      expect(Number.isFinite(r.impact36)).toBe(true);
      expect(Number.isFinite(r.overPerform)).toBe(true);
    }
    // the league-wide over/under-performance is centered on zero by construction
    const mean = rows.reduce((a, r) => a + r.overPerform, 0) / rows.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    for (const p of userPercentiles(rows)) expect(p.pct).toBeGreaterThanOrEqual(0), expect(p.pct).toBeLessThanOrEqual(100);

    const teams = teamAnalytics(s);
    expect(teams.length).toBe(s.league.teamIds.length);
    expect(teams[0].margin).toBeGreaterThanOrEqual(teams[teams.length - 1].margin);
    // expected wins across the league roughly equal actual wins
    const luck = teams.reduce((a, t) => a + t.luck, 0);
    expect(Math.abs(luck)).toBeLessThan(teams.length * 2);
  });
});
