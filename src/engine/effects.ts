import type { Effect, GameState, RelField } from '../state/schemas';
import { RATING_LABELS } from '../state/schemas';
import { makeNpc } from './generate';
import { RNG, clamp } from './rng';

/**
 * Caps applied per scene/source. The LLM may *propose* anything; the engine
 * clamps it to these limits so the story can't break the simulation.
 */
export interface EffectCaps {
  relPerField: number;
  morale: number;
  energy: number;
  ratingTotal: number;
  reputation: number;
  followersPct: number;
  money: number;
  academics: number;
  newNpcs: number;
  memories: number;
}

export const SCENE_CAPS: EffectCaps = {
  relPerField: 15,
  morale: 15,
  energy: 15,
  ratingTotal: 1,
  reputation: 5,
  followersPct: 0.15,
  money: 25000,
  academics: 0.2,
  newNpcs: 1,
  memories: 4,
};

export const GAME_CAPS: EffectCaps = { ...SCENE_CAPS, ratingTotal: 0, newNpcs: 0 };

export interface ApplyResult {
  applied: string[];
  rejected: string[];
}

const REL_RANGES: Record<RelField, [number, number]> = {
  affinity: [-100, 100],
  respect: [0, 100],
  trust: [0, 100],
  rivalry: [0, 100],
  romance: [0, 100],
};

/** Resolve an NPC reference the LLM gave us (id, or exact/partial name). */
export function resolveNpc(state: GameState, ref: string): string | null {
  if (state.npcs[ref]) return ref;
  const lower = ref.toLowerCase().trim();
  const all = Object.values(state.npcs);
  const exact = all.find((n) => n.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = all.filter((n) => n.name.toLowerCase().split(' ').some((part) => part === lower));
  return partial.length === 1 ? partial[0].id : null;
}

/**
 * The single mutation point for narrative-driven changes. Mutates `state` in
 * place (callers pass a draft/clone), clamps every value, and logs every change.
 */
export function applyEffects(state: GameState, effects: Effect[], source: string, caps: EffectCaps = SCENE_CAPS, rng?: RNG): ApplyResult {
  const applied: string[] = [];
  const rejected: string[] = [];
  const p = state.player;
  const user = state.athletes[p.athleteId];
  const used = { rating: 0, npcs: 0, memories: 0, rel: new Map<string, number>(), morale: 0, rep: 0 };
  const capDelta = (d: number, cap: number) => clamp(Math.round(d * 100) / 100, -cap, cap);

  for (const e of effects) {
    switch (e.type) {
      case 'rel': {
        const id = resolveNpc(state, e.npc);
        if (!id) {
          rejected.push(`unknown npc "${e.npc}"`);
          break;
        }
        const key = `${id}:${e.field}`;
        const sofar = used.rel.get(key) ?? 0;
        const d = Math.round(capDelta(e.delta, caps.relPerField - Math.abs(sofar)));
        if (d === 0) break;
        used.rel.set(key, sofar + d);
        const rel = state.npcs[id].relationship;
        const [lo, hi] = REL_RANGES[e.field];
        rel[e.field] = clamp(rel[e.field] + d, lo, hi);
        applied.push(`${state.npcs[id].name}: ${e.field} ${d > 0 ? '+' : ''}${d}`);
        break;
      }
      case 'morale': {
        const d = Math.round(capDelta(e.delta, caps.morale - Math.abs(used.morale)));
        if (!d) break;
        used.morale += d;
        p.morale = clamp(p.morale + d, 0, 100);
        applied.push(`Morale ${d > 0 ? '+' : ''}${d}`);
        break;
      }
      case 'energy': {
        const d = Math.round(capDelta(e.delta, caps.energy));
        if (!d) break;
        p.energy = clamp(p.energy + d, 0, 100);
        applied.push(`Energy ${d > 0 ? '+' : ''}${d}`);
        break;
      }
      case 'rating': {
        const remaining = caps.ratingTotal - used.rating;
        const d = Math.round(clamp(e.delta, -remaining, remaining));
        if (!d) {
          if (e.delta) rejected.push(`rating ${e.key} ${e.delta} over cap`);
          break;
        }
        used.rating += Math.abs(d);
        user.ratings[e.key] = clamp(user.ratings[e.key] + d, 1, 99);
        applied.push(`${RATING_LABELS[e.key]} ${d > 0 ? '+' : ''}${d}`);
        break;
      }
      case 'reputation': {
        const d = Math.round(capDelta(e.delta, caps.reputation - Math.abs(used.rep)));
        if (!d) break;
        used.rep += d;
        p.reputation = clamp(p.reputation + d, 0, 100);
        applied.push(`Reputation ${d > 0 ? '+' : ''}${d}`);
        break;
      }
      case 'followers': {
        const cap = Math.max(50, p.followers * caps.followersPct);
        const d = Math.round(clamp(e.delta, -cap, cap));
        if (!d) break;
        p.followers = Math.max(0, p.followers + d);
        applied.push(`Followers ${d > 0 ? '+' : ''}${d.toLocaleString()}`);
        break;
      }
      case 'money': {
        // amateurs can only receive small NIL-style money
        const cap = state.career.level === 'hs' ? 500 : state.career.level === 'college' ? caps.money : caps.money * 4;
        const d = Math.round(clamp(e.delta, -cap, cap));
        if (!d) break;
        p.money = Math.max(0, p.money + d);
        applied.push(`Money ${d > 0 ? '+' : '-'}$${Math.abs(d).toLocaleString()}`);
        break;
      }
      case 'academics': {
        if (state.career.level === 'pro') break;
        const d = capDelta(e.delta, caps.academics);
        if (!d) break;
        p.academics = clamp(Math.round((p.academics + d) * 100) / 100, 0, 4);
        applied.push(`GPA ${d > 0 ? '+' : ''}${d.toFixed(2)}`);
        break;
      }
      case 'flag': {
        if (!/^[a-z0-9_]{1,40}$/i.test(e.key)) {
          rejected.push(`bad flag key ${e.key}`);
          break;
        }
        state.story.flags[e.key] = typeof e.value === 'string' ? e.value.slice(0, 120) : e.value;
        break;
      }
      case 'memory': {
        const id = resolveNpc(state, e.npc);
        if (!id || used.memories >= caps.memories) break;
        used.memories++;
        const mem = state.npcs[id].memories;
        mem.push(e.text.slice(0, 160));
        if (mem.length > 8) mem.splice(0, mem.length - 8);
        break;
      }
      case 'npc_new': {
        if (used.npcs >= caps.newNpcs || !rng) {
          rejected.push(`npc_new ${e.name} over cap`);
          break;
        }
        if (resolveNpc(state, e.name)) break; // already exists
        if (e.role === 'teammate' || e.role === 'rival') {
          // player NPCs must come from the engine so they have real ratings
          rejected.push(`npc_new ${e.name}: role ${e.role} is engine-only`);
          break;
        }
        used.npcs++;
        const npc = makeNpc(rng, {
          name: e.name.slice(0, 40),
          role: e.role,
          title: e.title.slice(0, 60),
          season: state.career.season,
          personality: e.personality.slice(0, 3),
          rel: { respect: 20, trust: 20 },
        });
        state.npcs[npc.id] = npc;
        applied.push(`Met ${npc.name}`);
        break;
      }
      case 'arc_open': {
        const open = state.story.arcs.filter((a) => a.status === 'open');
        if (open.length >= 4) {
          rejected.push('too many open arcs');
          break;
        }
        state.story.arcs.push({
          id: `arc_${state.story.arcs.length + 1}`,
          title: e.title.slice(0, 60),
          stakes: e.stakes.slice(0, 200),
          npcIds: e.npcs.map((n) => resolveNpc(state, n)).filter((x): x is string => !!x),
          openedSeason: state.career.season,
          status: 'open',
        });
        applied.push(`New storyline: ${e.title}`);
        break;
      }
      case 'arc_close': {
        const arc = state.story.arcs.find((a) => a.id === e.id && a.status === 'open');
        if (!arc) break;
        arc.status = 'resolved';
        arc.outcome = e.outcome.slice(0, 200);
        applied.push(`Storyline resolved: ${arc.title}`);
        break;
      }
    }
  }

  for (const text of applied) {
    state.effectLog.push({ season: state.career.season, week: state.career.week, source, text });
  }
  if (state.effectLog.length > 300) state.effectLog.splice(0, state.effectLog.length - 300);
  return { applied, rejected };
}
