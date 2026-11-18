import { LEVEL_CONFIG } from '../data/teams';
import type { Athlete, GameState, Level, RatingKey } from '../state/schemas';
import { RATING_KEYS, RATING_LABELS } from '../state/schemas';
import { stockOf } from './draft';
import { ARCHETYPE_INFO, overall } from './ratings';

/**
 * A scouting report: what a scout would write about anyone in the league. Built from the save, never stored. It
 * turns raw ratings into judgments (grade, strengths, concerns, a likely peak) and says how ready they are for the
 * next level up.
 */

export interface ScoutingReport {
  id: string;
  grade: string;
  /** One line a scout would say. */
  headline: string;
  strengths: { key: RatingKey; label: string; value: number }[];
  concerns: { key: RatingKey; label: string; value: number }[];
  /** Where they are now, the most likely peak, and the best case. */
  now: number;
  likelyPeak: number;
  ceiling: number;
  /** Years of growth a player this age still has. */
  yearsToDevelop: number;
  readiness: 'ready' | 'soon' | 'project' | 'n/a';
  readinessText: string;
  /** Next level's name, or null for pros. */
  nextLevel: string | null;
  /** Their draft stock compared with yours, for college players: a positive number means better than you. */
  stockVsYou: number | null;
  risk: 'low' | 'medium' | 'high';
  riskText: string;
}

const NEXT: Record<Level, Level | null> = { hs: 'college', college: 'pro', pro: null };
const GRADES: [number, string][] = [
  [12, 'A+'],
  [9, 'A'],
  [6, 'A-'],
  [4, 'B+'],
  [2, 'B'],
  [0, 'B-'],
  [-2, 'C+'],
  [-4, 'C'],
  [-7, 'C-'],
  [-10, 'D'],
];

/** A letter against the level they play at: 'B-' is an average starter, 'A' is a star. */
export function gradeFor(ovr: number, level: Level): string {
  const d = ovr - LEVEL_CONFIG[level].ratingMean;
  return GRADES.find(([min]) => d >= min)?.[1] ?? 'F';
}

const FLAVOR: Partial<Record<RatingKey, string>> = {
  shooting: 'shooter',
  finishing: 'finisher',
  handles: 'ball handler',
  passing: 'passer',
  defense: 'defender',
  rebounding: 'rebounder',
  athleticism: 'athlete',
  iq: 'thinker',
  stamina: 'motor',
};

export function yearsToDevelop(age: number): number {
  return Math.max(0, 25 - age);
}

function riskOf(a: Athlete, gap: number): { risk: ScoutingReport['risk']; text: string } {
  const spread = RATING_KEYS.map((k) => a.ratings[k]);
  const lopsided = Math.max(...spread) - Math.min(...spread) >= 38;
  if (a.age >= 31) return { risk: 'high', text: 'Age is working against them.' };
  if (gap >= 14 && yearsToDevelop(a.age) <= 1) return { risk: 'high', text: 'The upside is a promise, and there is little time left to keep it.' };
  if (lopsided || gap >= 12) return { risk: 'medium', text: lopsided ? 'One or two skills carry them, and the weak spots can be targeted.' : 'A lot of the value is projection.' };
  return { risk: 'low', text: 'What you see is close to what you get.' };
}

/** Null if there is nobody with that id. */
export function scoutingReport(state: GameState, id: string): ScoutingReport | null {
  const a = state.athletes[id];
  if (!a) return null;
  const level = state.career.level;
  const mean = LEVEL_CONFIG[level].ratingMean;
  const ovr = overall(a.ratings);
  const sorted = [...RATING_KEYS].sort((x, y) => a.ratings[y] - a.ratings[x]);
  const strengths = sorted.filter((k) => a.ratings[k] >= mean + 6).slice(0, 3);
  const concerns = [...sorted].reverse().filter((k) => a.ratings[k] <= mean - 6).slice(0, 3);
  const yrs = yearsToDevelop(a.age);
  const gap = Math.max(0, a.potential - ovr);
  // most of the gap closes over the growth years, a little less the longer it has to wait
  const likelyPeak = Math.round(ovr + gap * Math.min(1, yrs / 4) * 0.7);
  const ceiling = Math.min(99, Math.max(ovr, a.potential + (yrs > 0 ? 2 : 0)));

  const next = NEXT[level];
  let readiness: ScoutingReport['readiness'] = 'n/a';
  let readinessText = 'Already at the top level.';
  if (next) {
    const nextMean = LEVEL_CONFIG[next].ratingMean;
    const lack = nextMean - 4 - ovr;
    readiness = lack <= 0 ? 'ready' : lack <= 8 || yrs >= 2 ? (lack <= 10 ? 'soon' : 'project') : 'project';
    if (lack <= 0) readinessText = `Could help a ${LEVEL_CONFIG[next].label} team right now.`;
    else if (likelyPeak >= nextMean - 4 && yrs > 0) readinessText = `A year or two away from ${LEVEL_CONFIG[next].label} minutes. The growth is there.`;
    else readinessText = `A project at ${LEVEL_CONFIG[next].label} level. Expect a long road.`;
    if (readiness === 'soon' && likelyPeak < nextMean - 4) readiness = 'project';
  }

  const top = sorted[0];
  const info = ARCHETYPE_INFO[a.archetype];
  const tone = ovr >= mean + 9 ? 'Star' : ovr >= mean + 3 ? 'Strong' : ovr >= mean - 3 ? 'Solid' : 'Raw';
  const upside = gap >= 10 && yrs >= 2 ? ' with real upside' : gap <= 2 && yrs <= 1 ? ' who is what they are' : '';
  const headline = `${tone} ${info.label.toLowerCase()}, best as a ${FLAVOR[top] ?? 'player'}${upside}.`;

  const me = state.athletes[state.player.athleteId];
  const stockVsYou = level === 'college' && me ? Math.round((stockOf(state, a) - stockOf(state, me)) * 10) / 10 : null;
  const r = riskOf(a, gap);
  return {
    id: a.id,
    grade: gradeFor(ovr, level),
    headline,
    strengths: strengths.map((k) => ({ key: k, label: RATING_LABELS[k], value: a.ratings[k] })),
    concerns: concerns.map((k) => ({ key: k, label: RATING_LABELS[k], value: a.ratings[k] })),
    now: ovr,
    likelyPeak,
    ceiling,
    yearsToDevelop: yrs,
    readiness,
    readinessText,
    nextLevel: next ? LEVEL_CONFIG[next].label : null,
    stockVsYou,
    risk: r.risk,
    riskText: r.text,
  };
}
