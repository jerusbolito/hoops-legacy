import type { GameState, Npc } from '../state/schemas';

/**
 * Who matters right now. The narrator can meet a new person in any scene, so over a long career the cast could grow
 * without limit. These helpers keep the people who matter in every prompt and let minor characters fade out.
 */

const ROLE_WEIGHT: Record<string, number> = { coach: 5, family: 4, friend: 4, rival: 4, love_interest: 4, teammate: 3, agent: 3, mentor: 3, scout: 2, media: 2, other: 1 };

/** Higher = more worth mentioning in a prompt. */
export function relevance(state: GameState, n: Npc): number {
  const r = n.relationship;
  const openArc = state.story.arcs.some((a) => a.status === 'open' && a.npcIds.includes(n.id)) ? 6 : 0;
  const dueRipple = state.story.ripples.some((x) => x.status !== 'resolved' && x.npcId === n.id) ? 4 : 0;
  const recent = Math.max(0, 3 - (state.career.season - n.metSeason)) * 0.4;
  return (
    (ROLE_WEIGHT[n.role] ?? 1) +
    openArc +
    dueRipple +
    (n.keyMemories?.length ?? 0) * 1.5 +
    Math.min(5, n.memories.length) * 0.3 +
    Math.abs(r.affinity) / 50 +
    r.rivalry / 50 +
    r.romance / 40 +
    recent +
    (n.estranged ? 1 : 0)
  );
}

/** The most relevant characters first. */
export function byRelevance(state: GameState, npcs: Npc[]): Npc[] {
  return [...npcs].sort((a, b) => relevance(state, b) - relevance(state, a) || a.id.localeCompare(b.id));
}

/** How many active characters the story keeps around. */
export const MAX_ACTIVE_CAST = 24;

/**
 * Who can never be trimmed: the people the game itself is built around (your coach, family, the teammates, friend and
 * rival who actually play), your first agent, someone you are in love with, and anyone in an open storyline or waiting
 * consequence. Everyone else is judged on how much they matter. A role name alone is not protection, because the narrator
 * can mint a lot of "friends" and "agents".
 */
function protectedIds(state: GameState, active: Npc[]): Set<string> {
  const keep = new Set<string>();
  const plays = (n: Npc) => !!n.athleteId && !!state.athletes[n.athleteId];
  for (const n of active) {
    if (n.role === 'coach' || n.role === 'family') keep.add(n.id);
    else if ((n.role === 'rival' || n.role === 'teammate' || n.role === 'friend') && plays(n)) keep.add(n.id);
    else if (n.role === 'love_interest' && n.relationship.romance >= 15) keep.add(n.id);
  }
  const agent = active.filter((n) => n.role === 'agent').sort((a, b) => a.metSeason - b.metSeason || a.id.localeCompare(b.id))[0];
  if (agent) keep.add(agent.id);
  for (const a of state.story.arcs) if (a.status === 'open') for (const id of a.npcIds) keep.add(id);
  for (const r of state.story.ripples) if (r.status !== 'resolved' && r.npcId) keep.add(r.npcId);
  return keep;
}

/**
 * If too many characters are active, the least relevant minor ones move on: they leave the cast and are marked as
 * past acquaintances. Returns who left, so the caller can record it. Nobody who is part of the core story is touched.
 */
export function trimCast(state: GameState): Npc[] {
  const active = Object.values(state.npcs).filter((n) => n.active);
  if (active.length <= MAX_ACTIVE_CAST) return [];
  const safe = protectedIds(state, active);
  const candidates = byRelevance(state, active.filter((n) => !safe.has(n.id))).reverse();
  const left: Npc[] = [];
  for (const n of candidates) {
    if (active.length - left.length <= MAX_ACTIVE_CAST) break;
    n.active = false;
    n.title = `Someone you used to know (${n.title.split(',')[0]})`;
    left.push(n);
  }
  return left;
}
