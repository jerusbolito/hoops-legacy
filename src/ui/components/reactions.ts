import type { Npc } from '../../state/schemas';
import type { Mood } from './Portrait';

export interface Reaction {
  /** How their face should look right after the scene, or undefined to keep their usual mood. */
  mood?: Mood;
  chips: { icon: string; label: string; good: boolean }[];
}

const FIELD: Record<string, { icon: string; label: string; weight: number }> = {
  affinity: { icon: '♥', label: 'likes you', weight: 1 },
  respect: { icon: '★', label: 'respect', weight: 0.5 },
  trust: { icon: '🔒', label: 'trust', weight: 0.5 },
  rivalry: { icon: '⚡', label: 'rivalry', weight: -1 },
  romance: { icon: '💘', label: 'romance', weight: 1 },
};

/**
 * Turns the engine's applied-effect lines ("Maya: affinity +5") into what the player should SEE on each
 * character: a mood change and small badges. Only reads text the engine produced, never the model's.
 */
export function reactionsFrom(applied: string[], cast: Npc[]): Record<string, Reaction> {
  const out: Record<string, Reaction> = {};
  const score: Record<string, number> = {};
  const rivalUp: Record<string, boolean> = {};
  for (const line of applied) {
    const m = /^(.+): (affinity|respect|trust|rivalry|romance) ([+-]\d+)$/.exec(line.trim());
    if (!m) continue;
    const npc = cast.find((n) => n.name === m[1]);
    if (!npc) continue;
    const delta = Number(m[3]);
    const f = FIELD[m[2]];
    (out[npc.id] ??= { chips: [] }).chips.push({ icon: f.icon, label: `${f.label} ${delta > 0 ? '+' : ''}${delta}`, good: f.weight * delta > 0 });
    score[npc.id] = (score[npc.id] ?? 0) + f.weight * delta;
    if (m[2] === 'rivalry' && delta > 0) rivalUp[npc.id] = true;
  }
  for (const id of Object.keys(out)) {
    const s = score[id] ?? 0;
    out[id].mood = s >= 3 ? 'happy' : s <= -3 ? (rivalUp[id] ? 'angry' : 'sad') : undefined;
  }
  return out;
}
