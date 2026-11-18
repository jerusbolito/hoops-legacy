import type { GameState } from '../state/schemas';

/**
 * How the coach shades their own roster in a game. Lives apart from coaching.ts so league.ts can use it without a
 * cycle. Reputation moves the whole roster by up to a point and a quarter either way; the philosophy tilts it.
 */
export function coachRatingMods(state: GameState): Record<string, number> {
  const c = state.coaching;
  if (!c.active || !c.teamId || c.stage === 'offers') return {};
  const team = state.teams[c.teamId];
  if (!team) return {};
  const base = (c.rep - 50) / 40;
  const out: Record<string, number> = {};
  for (const id of team.rosterIds) {
    const a = state.athletes[id];
    if (!a) continue;
    // win now: veterans play above themselves; develop: the kids are not asked to carry it yet
    const phil = c.philosophy === 'win_now' ? (a.age >= 26 ? 1 : 0) : c.philosophy === 'develop' ? (a.age <= 24 ? -0.5 : 0) : 0;
    out[id] = Math.round((base + phil) * 10) / 10;
  }
  return out;
}
