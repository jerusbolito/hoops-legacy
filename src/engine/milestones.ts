import type { GameLogEntry, GameState } from '../state/schemas';
import { openGoals } from './goals';
import { TIER_LABELS, legendOf } from './legacyScore';

/**
 * The stories a paper tells about a career as it goes: round-number milestones, career nights, streaks, a goal coming
 * into view, and, in the offseason, a look back. Every line is computed from the saved game log, never rolled, and the
 * milestones that must be told once are remembered in story flags (`ms_*`), so a number is announced the week it is
 * crossed and never again.
 */

export interface Note {
  text: string;
  /** Bigger stories lead the paper. */
  big: boolean;
}

const POINTS = [250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000];
const REBOUNDS = [250, 500, 1000, 2000, 3000, 5000];
const ASSISTS = [250, 500, 1000, 2000, 3000, 5000];
const STEALS = [100, 250, 500, 1000];
const BLOCKS = [100, 250, 500, 1000];

const HOT = { hs: 25, college: 28, pro: 34 } as const;
const WIN_STREAKS = [4, 6, 8, 10, 12, 15, 20];
const LOSS_STREAKS = [4, 6, 8, 10];
const HOT_STREAKS = [4, 6, 8, 10, 15];
const DOUBLE_DIGITS = [10, 20, 30, 50];

const played = (e: GameLogEntry) => e.line.sec > 0;
const reb = (e: GameLogEntry) => e.line.orb + e.line.drb;
/** The categories a game reached ten in, so the story names the right numbers. */
const tens = (e: GameLogEntry): string[] =>
  (
    [
      [e.line.pts, 'points'],
      [reb(e), 'rebounds'],
      [e.line.ast, 'assists'],
      [e.line.stl, 'steals'],
      [e.line.blk, 'blocks'],
    ] as [number, string][]
  )
    .filter(([v]) => v >= 10)
    .map(([v, n]) => `${v} ${n}`);
const joinList = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** How many games in a row, ending now, satisfy a test. Games the player missed break nothing and count for nothing. */
function streak(log: GameLogEntry[], test: (e: GameLogEntry) => boolean): number {
  let n = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (!played(log[i])) continue;
    if (!test(log[i])) break;
    n++;
  }
  return n;
}

/** The most notable newly crossed number for one stat: older ones are quietly marked done so they never come up late. */
function crossed(state: GameState, key: string, total: number, steps: number[]): number | null {
  let best: number | null = null;
  for (const m of steps) {
    const flag = `ms_${key}_${m}`;
    if (total >= m && state.story.flags[flag] !== true) {
      state.story.flags[flag] = true;
      best = m;
    }
  }
  return best;
}

/** What this week's game added to the record. Call once per printed weekly issue. */
export function milestoneNotes(state: GameState): Note[] {
  const c = state.career;
  const me = state.athletes[state.player.athleteId];
  const log = state.gameLog;
  const last = log[log.length - 1];
  const notes: Note[] = [];
  const name = `${me.firstName} ${me.lastName}`;

  // everything below is about the game just played this week
  if (last && last.season === c.season && last.week === c.week && played(last)) {
    const prior = log.slice(0, -1).filter(played);
    const sum = (f: (e: GameLogEntry) => number) => log.reduce((s, e) => s + (played(e) ? f(e) : 0), 0);

    const totalsByStat: [string, number, number[], string][] = [
      ['pts', sum((e) => e.line.pts), POINTS, 'career points'],
      ['reb', sum(reb), REBOUNDS, 'career rebounds'],
      ['ast', sum((e) => e.line.ast), ASSISTS, 'career assists'],
      ['stl', sum((e) => e.line.stl), STEALS, 'career steals'],
      ['blk', sum((e) => e.line.blk), BLOCKS, 'career blocks'],
    ];
    for (const [key, total, steps, label] of totalsByStat) {
      const m = crossed(state, key, total, steps);
      if (m) notes.push({ text: `${name} passed ${m.toLocaleString()} ${label} this week and now has ${total.toLocaleString()}.`, big: m >= (key === 'pts' ? 1000 : 500) });
    }

    // a career night
    const bestPts = prior.reduce((m, e) => Math.max(m, e.line.pts), 0);
    if (prior.length >= 8 && last.line.pts > bestPts && last.line.pts >= HOT[c.level] * 0.6) {
      notes.push({ text: `${last.line.pts} points is a career high for ${me.lastName}, topping the ${bestPts} from earlier in the career.`, big: true });
    }
    const cats = tens(last);
    const n = cats.length;
    if (n >= 3 && state.story.flags.ms_first_td !== true) {
      state.story.flags.ms_first_td = true;
      state.story.flags.ms_first_dd = true;
      notes.push({ text: `${me.lastName}'s first career triple-double: ${joinList(cats)}.`, big: true });
    } else if (n >= 2 && state.story.flags.ms_first_dd !== true) {
      state.story.flags.ms_first_dd = true;
      notes.push({ text: `${me.lastName}'s first career double-double: ${joinList(cats)}.`, big: false });
    }

    // streaks, told when they hit a round length
    const wins = streak(log, (e) => e.teamScore > e.oppScore);
    if (WIN_STREAKS.includes(wins)) notes.push({ text: `${state.teams[c.teamId].name} have now won ${wins} games in a row.`, big: wins >= 8 });
    const losses = streak(log, (e) => e.teamScore < e.oppScore);
    if (LOSS_STREAKS.includes(losses)) notes.push({ text: `${state.teams[c.teamId].name} have dropped ${losses} straight and need an answer.`, big: false });
    const hotMark = Math.round(HOT[c.level] * 0.7);
    const hot = streak(log, (e) => e.line.pts >= hotMark);
    if (HOT_STREAKS.includes(hot)) notes.push({ text: `${me.lastName} has scored ${hotMark} or more in ${hot} straight games.`, big: hot >= 8 });
    const double = streak(log, (e) => e.line.pts >= 10);
    if (DOUBLE_DIGITS.includes(double) && c.level !== 'hs') notes.push({ text: `${me.lastName} has reached double figures in ${double} games in a row.`, big: double >= 30 });
  }

  // a goal coming into view
  for (const g of openGoals(state)) {
    const band = g.pct >= 95 ? 95 : g.pct >= 80 ? 80 : g.pct >= 60 ? 60 : 0;
    if (!band) continue;
    const flag = `ms_goal_${g.id}_${band}`;
    if (state.story.flags[flag] === true) continue;
    // mark every lower band as told, so only the newest one is printed
    for (const b of [60, 80, 95]) if (b <= band) state.story.flags[`ms_goal_${g.id}_${b}`] = true;
    notes.push({ text: `Within sight: "${g.title}". ${g.detail}.`, big: false });
    break; // one goal story a week
  }
  return notes;
}

/** Looks back, for the preview and the season in review: anniversaries, and how an heir compares to the parent. */
export function archiveNotes(state: GameState, kind: 'preview' | 'recap'): Note[] {
  const c = state.career;
  const me = state.athletes[state.player.athleteId];
  const notes: Note[] = [];
  const years: Record<number, string> = { 5: 'Five', 10: 'Ten', 15: 'Fifteen', 20: 'Twenty' };
  for (const a of state.player.awards) {
    const ago = c.season - a.season;
    // an anniversary is told once a year, when the new season is previewed
    if (kind !== 'preview' || !years[ago] || !(a.name.endsWith('Champion') || a.name.includes('MVP'))) continue;
    notes.push({ text: `${years[ago]} years ago this season, ${me.lastName} won the ${a.name.replace(/ Champion$/, ' title').replace(/^League /, '')}.`, big: false });
  }

  const gen = state.legacy.generation;
  const parent = state.legacy.lineage[state.legacy.lineage.length - 1];
  if (gen > 1 && parent) {
    if (state.story.flags.ms_heir_intro !== true) {
      state.story.flags.ms_heir_intro = true;
      notes.push({ text: `${me.firstName} ${me.lastName} arrives with a famous name. ${parent.name} retired as a ${TIER_LABELS[parent.tier]} with ${parent.titles} title${parent.titles === 1 ? '' : 's'}${parent.mvps ? ` and ${parent.mvps} MVP award${parent.mvps === 1 ? '' : 's'}` : ''}, and everyone wants to know how far the next one goes.`, big: true });
    } else {
      const mine = state.gameLog.filter((e) => e.season === c.season && played(e));
      if (mine.length >= 5) {
        const ppg = mine.reduce((s, e) => s + e.line.pts, 0) / mine.length;
        const theirs = parent.proGp > 0 ? parent.proPpg : parent.ppg;
        notes.push({ text: `${me.lastName} is averaging ${ppg.toFixed(1)} points this year. ${parent.firstName} ${parent.lastName} finished a career at ${theirs.toFixed(1)}.`, big: false });
      }
      const mine2 = legendOf(state);
      if (mine2.score >= parent.score * 0.5 && state.story.flags.ms_halfway !== true) {
        state.story.flags.ms_halfway = true;
        notes.push({ text: `Halfway to ${parent.firstName}'s legacy: ${me.lastName} has ${Math.round(mine2.score)} of ${Math.round(parent.score)} career points.`, big: true });
      }
    }
  }
  return notes;
}
