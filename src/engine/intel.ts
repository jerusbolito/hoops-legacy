import type { Athlete, PlayerLine, RatingKey } from '../state/schemas';

/**
 * Scouting information shown on a key-moment decision card. Everything here is read from the
 * simulator's own state (ratings, box-score lines, recent shots), so it is never invented.
 */

export type Heat = 'hot' | 'cold' | null;

export interface PlayerIntel {
  id: string;
  name: string;
  short: string;
  position: string;
  ovr: number;
  ownTeam: boolean;
  ratings: Record<RatingKey, number>;
  line: { min: number; pts: number; fgm: number; fga: number; tpm: number; tpa: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number };
  /** Results of this player's most recent field-goal attempts, oldest first (true = made). */
  recent: boolean[];
  heat: Heat;
  tags: string[];
}

/** "Your rating vs his rating" for one decision option. */
export interface Edge {
  yours: string;
  you: number;
  theirs: string;
  them: number;
}

export interface TeamQuick {
  abbrev: string;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  reb: number;
  ast: number;
  tov: number;
}

export interface MomentIntel {
  you: PlayerIntel;
  /** The player guarding you (offense) or attacking you (defense). */
  matchup: PlayerIntel;
  teammates: PlayerIntel[];
  opponents: PlayerIntel[];
  teams: { us: TeamQuick; them: TeamQuick };
  /** The shot the attacker is expected to take, on defensive moments. */
  expectedShot?: 'rim' | 'mid' | 'three';
  /** Plain-language observations, most useful first. */
  tips: string[];
}

export const RECENT_SHOTS = 5;

/** Hot after 3 straight makes (or 4 of the last 5). Cold after 4 straight misses (or 1 or fewer of the last 5). */
export function heatOf(recent: boolean[]): Heat {
  const last3 = recent.slice(-3);
  const last4 = recent.slice(-4);
  const last5 = recent.slice(-5);
  const made5 = last5.filter(Boolean).length;
  if (last3.length === 3 && last3.every(Boolean)) return 'hot';
  if (last5.length === 5 && made5 >= 4) return 'hot';
  if (last4.length === 4 && last4.every((m) => !m)) return 'cold';
  if (last5.length === 5 && made5 <= 1) return 'cold';
  return null;
}

export function tagsFor(r: Record<RatingKey, number>, line: PlayerIntel['line'], mean: number, foulOut: number): string[] {
  const tags: string[] = [];
  if (line.pf >= foulOut - 1) tags.push('Foul trouble');
  if (r.defense >= mean + 10) tags.push('Lockdown defender');
  if (line.blk >= 2) tags.push('Shot blocker');
  if (line.stl >= 2) tags.push('Ball hawk');
  if (r.shooting >= mean + 12) tags.push('Sharpshooter');
  if (r.finishing >= mean + 12) tags.push('Finisher');
  if (r.passing >= mean + 12) tags.push('Playmaker');
  if (r.athleticism >= mean + 14) tags.push('Athlete');
  return tags.slice(0, 3);
}

export function playerIntel(
  a: Athlete,
  ctx: { ownTeam: boolean; line: PlayerLine; recent: boolean[]; rating: (a: Athlete, k: RatingKey) => number; ovr: number; mean: number; foulOut: number; short: string; keys: readonly RatingKey[] },
): PlayerIntel {
  const ratings = Object.fromEntries(ctx.keys.map((k) => [k, ctx.rating(a, k)])) as Record<RatingKey, number>;
  const l = ctx.line;
  const line = { min: Math.round(l.sec / 60), pts: l.pts, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, reb: l.orb + l.drb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf };
  const recent = ctx.recent.slice(-RECENT_SHOTS);
  return {
    id: a.id,
    name: `${a.firstName} ${a.lastName}`,
    short: ctx.short,
    position: a.position,
    ovr: ctx.ovr,
    ownTeam: ctx.ownTeam,
    ratings,
    line,
    recent,
    heat: heatOf(recent),
    tags: tagsFor(ratings, line, ctx.mean, ctx.foulOut),
  };
}

export function teamQuick(abbrev: string, score: number, lines: PlayerLine[]): TeamQuick {
  const sum = (f: (l: PlayerLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return { abbrev, pts: score, fgm: sum((l) => l.fgm), fga: sum((l) => l.fga), tpm: sum((l) => l.tpm), tpa: sum((l) => l.tpa), reb: sum((l) => l.orb + l.drb), ast: sum((l) => l.ast), tov: sum((l) => l.tov) };
}

const madeOf = (p: PlayerIntel) => `${p.recent.filter(Boolean).length} of his last ${p.recent.length}`;

/** The few things worth knowing before choosing. Short, literal, and only from the numbers above. */
export function tipsFor(o: { kind: 'offense' | 'defense'; you: PlayerIntel; matchup: PlayerIntel; teammates: PlayerIntel[]; mean: number; foulOut: number; expectedShot?: 'rim' | 'mid' | 'three' }): string[] {
  const { you, matchup: m } = o;
  const tips: string[] = [];

  if (o.kind === 'offense') {
    const d = m.ratings.defense;
    if (d >= o.mean + 10) tips.push(`${m.short} is a lockdown defender (DEF ${d}). Every shot against him is harder than usual.`);
    else if (d <= o.mean - 8) tips.push(`${m.short} is a weak defender (DEF ${d}). This is a good matchup to attack.`);
    else tips.push(`${m.short} is an average defender (DEF ${d}).`);
    if (m.line.pf >= o.foulOut - 1) tips.push(`${m.short} has ${m.line.pf} fouls. Attacking the rim could get him in more trouble.`);
    if (m.line.blk >= 2) tips.push(`${m.short} already has ${m.line.blk} blocks tonight. Be careful going at the rim.`);
    const hotMate = o.teammates.filter((t) => t.heat === 'hot').sort((a, b) => b.recent.filter(Boolean).length - a.recent.filter(Boolean).length)[0];
    if (hotMate) tips.push(`${hotMate.short} has the hot hand (${madeOf(hotMate)}). Passing to him is a strong option.`);
  } else {
    if (o.expectedShot) {
      const what = o.expectedShot === 'rim' ? `attack the rim (FIN ${m.ratings.finishing})` : o.expectedShot === 'three' ? `shoot the three (SHO ${m.ratings.shooting})` : `pull up for a jumper (SHO ${m.ratings.shooting})`;
      tips.push(`${m.short} is looking to ${what}.`);
    }
    if (m.heat === 'hot') tips.push(`${m.short} has hit ${madeOf(m)}. He is feeling it.`);
    else if (m.heat === 'cold') tips.push(`${m.short} has made ${madeOf(m)}. He is cold.`);
    if (m.tags.includes('Sharpshooter')) tips.push(`${m.short} is a sharpshooter, so give him no room on the perimeter.`);
    if (you.line.pf >= o.foulOut - 1) tips.push(`You have ${you.line.pf} fouls and are out at ${o.foulOut}. A failed block could end your night.`);
  }

  if (you.heat === 'hot') tips.push(`You are ${you.line.fgm}-for-${you.line.fga} tonight and have the hot hand.`);
  else if (you.heat === 'cold') tips.push(`You are ${you.line.fgm}-for-${you.line.fga} tonight and your shot is not falling.`);

  return tips.slice(0, 5);
}
