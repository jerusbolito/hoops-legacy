import { describe, expect, it } from 'vitest';
import { PRO_TEAMS } from '../data/teams';
import type { GameState } from '../state/schemas';
import { createCareer, runDraft, userAthlete } from './career';
import { DRAFT_PICKS, boardRank, draftBoard, draftStock, projectedPick, simulateDraft } from './draft';
import { RNG } from './rng';
import { playUntil } from './testkit';

const make = (seed: number) => createCareer({ firstName: 'Dr', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function atDraft(seed: number): GameState {
  const s = make(seed);
  const rng = new RNG(seed);
  playUntil(s, rng, (x) => x.career.phase === 'draft' && !x.career.lifeEvent);
  expect(s.career.phase).toBe('draft');
  return s;
}

describe('the draft class', () => {
  it('is a real board: every prospect in the league, best first, with you on it', () => {
    const s = atDraft(3);
    const board = draftBoard(s);
    expect(board.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < board.length; i++) expect(board[i - 1].stock).toBeGreaterThanOrEqual(board[i].stock);
    expect(board.filter((p) => p.isUser)).toHaveLength(1);
    expect(new Set(board.map((p) => p.id)).size).toBe(board.length);
    // a player outside the top of the board is still shown, with their true rank
    const at = board.findIndex((p) => p.isUser) + 1;
    if (at <= 44) expect(boardRank(s)).toBe(at);
    else expect(boardRank(s)).toBeGreaterThanOrEqual(44);
    expect(projectedPick(s)).toMatch(/^Projected (lottery pick|first round|second round|undrafted)$/);
    expect(draftStock(s)).toBeCloseTo(board.find((p) => p.isUser)!.stock, 0);
  });

  it('runs two rounds: the worst teams pick first, nobody is picked twice, and the best go early', () => {
    const s = atDraft(4);
    const sim = simulateDraft(s, new RNG(1));
    expect(sim.picks).toHaveLength(DRAFT_PICKS);
    expect(new Set(sim.picks.map((p) => p.name)).size).toBe(DRAFT_PICKS);
    const worst = [...PRO_TEAMS].sort((a, b) => a.prestige - b.prestige);
    expect(sim.picks[0].team).toBe(worst[0].name);
    expect(sim.picks[PRO_TEAMS.length].team).toBe(worst[0].name); // round two starts over
    const board = draftBoard(s);
    const pickOf = (id: string) => sim.drafted.get(id);
    const early = board.slice(0, 5).map((p) => sim.picks.findIndex((x) => x.name === p.name));
    const late = board.slice(25, 35).map((p) => sim.picks.findIndex((x) => x.name === p.name));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + (b < 0 ? DRAFT_PICKS + 5 : b), 0) / xs.length;
    expect(avg(early)).toBeLessThan(avg(late));
    void pickOf;
    // the user's pick, if any, matches the list
    if (sim.userPick) expect(sim.picks[sim.userPick - 1].isUser).toBe(true);
    else expect(sim.picks.some((p) => p.isUser)).toBe(false);
  });

  it('rewards a better player with a better pick, and a weak one is passed over', () => {
    const pickFor = (boost: number, seed: number) => {
      const s = atDraft(seed);
      for (const k of Object.keys(userAthlete(s).ratings) as (keyof ReturnType<typeof userAthlete>['ratings'])[]) userAthlete(s).ratings[k] = Math.max(20, Math.min(99, userAthlete(s).ratings[k] + boost));
      return simulateDraft(s, new RNG(7)).userPick;
    };
    const star = pickFor(25, 5);
    const weak = pickFor(-30, 5);
    expect(star).not.toBeNull();
    expect(star!).toBeLessThanOrEqual(5);
    expect(weak).toBeNull();
  }, 30_000);

  it('the real draft sends you to the team that picked you, and your rival or friend to theirs', () => {
    let checked = 0;
    for (const seed of [3, 12, 99, 2024]) {
      const s = atDraft(seed);
      const rival = Object.values(s.npcs).find((n) => n.role === 'rival' && n.athleteId && s.athletes[n.athleteId]);
      const friend = Object.values(s.npcs).find((n) => n.role === 'friend' && n.athleteId && s.athletes[n.athleteId]);
      const res = runDraft(s);
      expect(res.picks).toHaveLength(DRAFT_PICKS);
      expect(s.career.level).toBe('pro');
      expect(s.player.draftPick).toBe(res.pick);
      if (res.pick) expect(res.picks[res.pick - 1].isUser).toBe(true);
      expect(s.transactions.filter((t) => t.kind === 'draft').length).toBeGreaterThanOrEqual(4);
      for (const n of [rival, friend]) {
        if (!n?.athleteId || !s.athletes[n.athleteId]) continue;
        const pick = res.picks.find((p) => (n === rival ? p.isRival : p.isFriend));
        if (pick) {
          checked++;
          expect(s.teams[s.athletes[n.athleteId].teamId!].name).toBe(pick.team);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);
});
