import type { GameState, Npc } from '../state/schemas';
import { addNews } from './news';
import { modsOf } from './origin';
import { clamp } from './rng';

/**
 * The rival is not just a name on a roster: when your team plays theirs it is a marked game with a running series
 * record, and the result moves your morale and reputation more than an ordinary night.
 */

export interface RivalryGame {
  rival: Npc;
  w: number;
  l: number;
  teamName: string;
}

/** The rival's team is your next opponent. */
export function rivalryGame(state: GameState, oppTeamId: string | undefined): RivalryGame | null {
  if (!oppTeamId) return null;
  for (const n of Object.values(state.npcs)) {
    if (n.role !== 'rival' || !n.active || !n.athleteId) continue;
    const a = state.athletes[n.athleteId];
    if (a?.teamId === oppTeamId) return { rival: n, w: n.h2h.w, l: n.h2h.l, teamName: state.teams[oppTeamId].name };
  }
  return null;
}

export const seriesText = (w: number, l: number): string => (w === l ? `series tied ${w}-${l}` : w > l ? `you lead the series ${w}-${l}` : `they lead the series ${l}-${w}`);

/** After a game against the rival's team: update the series and what it means to you. Returns a one-line summary. */
export function recordRivalryGame(state: GameState, oppTeamId: string, won: boolean, score: string): string | null {
  const g = rivalryGame(state, oppTeamId);
  if (!g) return null;
  const n = g.rival;
  const before = n.h2h.w - n.h2h.l;
  if (won) n.h2h.w++;
  else n.h2h.l++;
  const p = state.player;
  p.morale = clamp(p.morale + Math.round((won ? 3 : -3) * modsOf(state).rivalMul), 0, 100);
  p.reputation = clamp(p.reputation + (won ? 1 : 0), 0, 100);
  n.relationship.rivalry = clamp(n.relationship.rivalry + 2, 0, 100);
  const after = n.h2h.w - n.h2h.l;
  const flip = Math.sign(before) !== Math.sign(after) && after !== 0;
  const text = `${won ? 'You beat' : 'You lost to'} ${n.name}'s ${g.teamName}, ${score}: ${seriesText(n.h2h.w, n.h2h.l)}${flip ? ' (the lead changes hands)' : ''}.`;
  addNews(state, text);
  n.memories.push(text);
  if (n.memories.length > 8) n.memories.shift();
  return text;
}
