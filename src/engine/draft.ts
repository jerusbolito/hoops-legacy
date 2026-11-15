import { PRO_TEAMS } from '../data/teams';
import type { Athlete, GameState, Position } from '../state/schemas';
import { overall } from './ratings';
import { RNG } from './rng';
import { averages, totals } from './stats';

/**
 * The draft is a real thing with other people in it. Every college player in the league is a prospect with a stock; the
 * worst teams pick first, each team looks at the best available and what it needs, and you go where the board takes you.
 * Your rival and your friend are on the board too, and land on the team that picks them.
 */

export const DRAFT_ROUNDS = 2;
export const DRAFT_PICKS = DRAFT_ROUNDS * PRO_TEAMS.length;
const BOARD_SIZE = 44;

export interface Prospect {
  id: string;
  name: string;
  position: Position;
  age: number;
  ovr: number;
  pot: number;
  stock: number;
  /** The college they play for. */
  team: string;
  isUser: boolean;
  isRival: boolean;
  isFriend: boolean;
}

const ppgOf = (state: GameState, a: Athlete): number => {
  if (a.id === state.player.athleteId) {
    return averages(totals(state.gameLog.filter((e) => e.season === state.career.season - 1 || e.season === state.career.season))).ppg;
  }
  const s = state.leagueStats[a.id];
  return s && s.gp > 0 ? s.pts / s.gp : 0;
};

/** How teams see a player: rating, scoring, youth and upside. The player's own stock adds reputation and the combine. */
export function stockOf(state: GameState, a: Athlete): number {
  const ovr = overall(a.ratings);
  const youth = Math.max(0, 22 - a.age) * 1.5;
  let v = ovr + ppgOf(state, a) * 0.25 + youth + (a.potential - ovr) * 0.25;
  if (a.id === state.player.athleteId) v += state.player.reputation * 0.05 + state.player.draftBoost;
  return v;
}

export const draftStock = (state: GameState): number => stockOf(state, state.athletes[state.player.athleteId]);

/** Every college player in the league, best first. */
function fullBoard(state: GameState): Prospect[] {
  const rivals = new Set(Object.values(state.npcs).filter((n) => n.role === 'rival' && n.athleteId).map((n) => n.athleteId!));
  const friends = new Set(Object.values(state.npcs).filter((n) => n.role === 'friend' && n.athleteId).map((n) => n.athleteId!));
  return state.league.teamIds
    .flatMap((t) => state.teams[t].rosterIds)
    .map((id) => state.athletes[id])
    .filter(Boolean)
    .map((a): Prospect => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      position: a.position,
      age: a.age,
      ovr: overall(a.ratings),
      pot: a.potential,
      stock: Math.round(stockOf(state, a) * 10) / 10,
      team: a.teamId ? state.teams[a.teamId].name : '',
      isUser: a.id === state.player.athleteId,
      isRival: rivals.has(a.id),
      isFriend: friends.has(a.id),
    }))
    .sort((x, y) => y.stock - x.stock);
}

/** The best prospects, best first. You are always on it, even if you are far down. */
export function draftBoard(state: GameState): Prospect[] {
  const all = fullBoard(state);
  const top = all.slice(0, BOARD_SIZE);
  const me = all.find((p) => p.isUser);
  if (me && !top.includes(me)) top.push(me);
  return top;
}

/** Where the player sits on the board, 1 = best prospect. */
export function boardRank(state: GameState): number {
  const i = fullBoard(state).findIndex((p) => p.isUser);
  return i < 0 ? BOARD_SIZE + 1 : i + 1;
}

export function projectedPick(state: GameState): string {
  const r = boardRank(state);
  if (r <= 5) return 'Projected lottery pick';
  if (r <= PRO_TEAMS.length) return 'Projected first round';
  if (r <= DRAFT_PICKS) return 'Projected second round';
  return 'Projected undrafted';
}

export interface DraftPick {
  pick: number;
  team: string;
  mascot: string;
  name: string;
  position: Position;
  college: string;
  isUser: boolean;
  isRival: boolean;
  isFriend: boolean;
}

export interface DraftSim {
  picks: DraftPick[];
  /** The user's pick number, or null if nobody called. */
  userPick: number | null;
  /** Athlete id -> the pro team (by name) that took them. */
  drafted: Map<string, string>;
}

/** Run the whole draft. The worst teams pick first; each team weighs the best available against what it needs. */
export function simulateDraft(state: GameState, rng: RNG): DraftSim {
  const order = [...PRO_TEAMS].sort((a, b) => a.prestige - b.prestige);
  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const need = new Map(order.map((t) => [t.name, rng.pick(positions)]));
  const pool = draftBoard(state);
  const picks: DraftPick[] = [];
  const drafted = new Map<string, string>();
  let userPick: number | null = null;
  for (let i = 0; i < DRAFT_PICKS && pool.length; i++) {
    const team = order[i % order.length];
    // the best few on the board, nudged by need and a little noise: surprises happen, but rarely wild ones
    const top = pool.slice(0, 7);
    let best = top[0];
    let bestScore = -Infinity;
    for (const p of top) {
      const score = p.stock + (p.position === need.get(team.name) ? 2.5 : 0) + rng.normal(0, 2.4);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    pool.splice(pool.indexOf(best), 1);
    drafted.set(best.id, team.name);
    if (best.isUser) userPick = i + 1;
    picks.push({ pick: i + 1, team: team.name, mascot: team.mascot, name: best.name, position: best.position, college: best.team, isUser: best.isUser, isRival: best.isRival, isFriend: best.isFriend });
  }
  return { picks, userPick, drafted };
}
