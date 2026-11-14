import { z } from 'zod';
import { EffectSchema, type Effect } from '../state/schemas';

/** Pull the first JSON object out of a model response (handles fences, prose, trailing commas). */
export function extractJson(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in response');
  const slice = t.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(slice).replace(/,\s*([}\]])/g, '$1'));
  }
}

/** Local models often emit raw newlines/tabs inside JSON strings; escape them. */
function escapeControlCharsInStrings(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) {
        esc = false;
        out += ch;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        out += ch;
        continue;
      }
      if (ch === '"') inStr = false;
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '';
      else if (ch === '\t') out += '\\t';
      else out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

const ChoiceSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  text: z.string().min(1).max(200),
  tone: z.string().default('neutral'),
});

export const SceneSetupSchema = z.object({
  title: z.string().min(1).max(80),
  location: z.string().max(80).default(''),
  narration: z.string().min(20),
  choices: z.array(ChoiceSchema).min(2).max(5),
});
export type SceneSetup = z.infer<typeof SceneSetupSchema>;

/** Effects are validated one by one so a single malformed effect doesn't sink the scene. */
export function parseEffects(raw: unknown): { effects: Effect[]; invalid: number } {
  if (!Array.isArray(raw)) return { effects: [], invalid: 0 };
  const effects: Effect[] = [];
  let invalid = 0;
  for (const r of raw) {
    const p = EffectSchema.safeParse(r);
    if (p.success) effects.push(p.data);
    else invalid++;
  }
  return { effects, invalid };
}

export const SceneResolveSchema = z.object({
  narration: z.string().min(10),
  summary: z.string().min(3).max(400),
  hook: z.string().max(300).nullish(),
  effects: z.unknown().optional(),
});

export const RecapSchema = z.object({
  headline: z.string().min(3).max(140),
  narration: z.string().min(10),
  effects: z.unknown().optional(),
});

export const SummarySchema = z.object({ summary: z.string().min(10), career: z.string().max(1600).nullish() });
export const FlavorSchema = z.object({ narration: z.string().min(10) });

/* ── Fact checking ── */

const STAT_WORDS: Record<string, 'pts' | 'reb' | 'ast' | 'stl' | 'blk'> = {
  point: 'pts',
  points: 'pts',
  pts: 'pts',
  rebound: 'reb',
  rebounds: 'reb',
  boards: 'reb',
  reb: 'reb',
  assist: 'ast',
  assists: 'ast',
  dimes: 'ast',
  ast: 'ast',
  steal: 'stl',
  steals: 'stl',
  block: 'blk',
  blocks: 'blk',
};

export interface AllowedNumbers {
  pts: Set<number>;
  reb: Set<number>;
  ast: Set<number>;
  stl: Set<number>;
  blk: Set<number>;
  scores: [number, number];
}

/**
 * Finds stat claims ("27 points", "11 boards", "61-58") that contradict the box score.
 * Small numbers (<=3) are allowed since they are often used narratively ("two points").
 */
export function findStatViolations(text: string, allowed: AllowedNumbers): string[] {
  const bad: string[] = [];
  const re = /\b(\d{1,3})[\s-]+(points?|pts|rebounds?|boards|reb|assists?|dimes|ast|steals?|blocks?)\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    const cat = STAT_WORDS[m[2].toLowerCase()];
    if (n <= 3 || !cat) continue;
    // "a 10-point lead" style margins are fine if they match the final margin
    if (cat === 'pts' && n === Math.abs(allowed.scores[0] - allowed.scores[1])) continue;
    if (!allowed[cat].has(n)) bad.push(m[0]);
  }
  const scoreRe = /\b(\d{2,3})\s*[-–]\s*(\d{2,3})\b/g;
  for (const m of text.matchAll(scoreRe)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [x, y] = allowed.scores;
    if (!((a === x && b === y) || (a === y && b === x))) bad.push(m[0]);
  }
  return bad;
}
