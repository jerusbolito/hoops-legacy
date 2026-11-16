import type { Goal, GameState } from '../state/schemas';
import { TIER_LABELS, TIER_MIN, careerTotals, legacyScore, peakOf, tierOf } from './legacyScore';
import { addNews } from './news';
import { goalForMotive } from './origin';
import { RNG } from './rng';

/**
 * Long-term targets for a career: always a few in sight, each worked out from the save, never from a roll. Three are
 * open at a time (one about the résumé, one about the player, one about life); finishing one brings the next.
 * Nothing here changes how a game is played or how hard it is. It only keeps score.
 */

export type GoalGroup = 'career' | 'player' | 'life';

export interface GoalView {
  id: string;
  kind: string;
  group: GoalGroup;
  icon: string;
  title: string;
  detail: string;
  value: number;
  target: number;
  pct: number;
  done: boolean;
  doneSeason: number;
}

interface Read {
  value: number;
  target: number;
  done: boolean;
  /** Human text for the progress, e.g. "4,120 of 10,000". */
  detail: string;
}

interface Def {
  kind: string;
  group: GoalGroup;
  icon: string;
  /** Targets this goal can be set with (a pool the picker draws from). */
  targets: number[];
  title(target: number, s: GameState): string;
  read(s: GameState, g: Goal): Read;
  /** False when the goal makes no sense for this save (already met, or no longer possible). */
  fits(s: GameState, target: number): boolean;
}

const n = (v: number) => Math.round(v).toLocaleString();
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v)}`);
const awardsNamed = (s: GameState, f: (name: string) => boolean) => s.player.awards.filter((a) => f(a.name)).length;
const rivals = (s: GameState) => Object.values(s.npcs).filter((x) => x.role === 'rival');
const countDone = (v: number, target: number, detail: string): Read => ({ value: v, target, done: v >= target, detail });

const DEFS: Def[] = [
  {
    kind: 'titles',
    group: 'career',
    icon: '🏆',
    targets: [2, 3, 5],
    title: (t) => `Win ${t} championships`,
    read: (s, g) => countDone(awardsNamed(s, (x) => x.endsWith('Champion')), g.target, `${awardsNamed(s, (x) => x.endsWith('Champion'))} of ${g.target}`),
    fits: (s, t) => awardsNamed(s, (x) => x.endsWith('Champion')) < t,
  },
  {
    kind: 'mvp',
    group: 'career',
    icon: '👑',
    targets: [1],
    title: () => 'Be named league MVP',
    read: (s, g) => countDone(awardsNamed(s, (x) => x.includes('MVP')), g.target, awardsNamed(s, (x) => x.includes('MVP')) ? 'Done' : 'Not yet'),
    fits: (s) => awardsNamed(s, (x) => x.includes('MVP')) < 1,
  },
  {
    kind: 'allstar',
    group: 'career',
    icon: '⭐',
    targets: [3, 5, 8],
    title: (t) => `Make ${t} All-Star teams`,
    read: (s, g) => countDone(awardsNamed(s, (x) => x === 'All-Star'), g.target, `${awardsNamed(s, (x) => x === 'All-Star')} of ${g.target}`),
    fits: (s, t) => awardsNamed(s, (x) => x === 'All-Star') < t,
  },
  {
    kind: 'hof',
    group: 'career',
    icon: '🏛️',
    targets: [4],
    title: () => 'Reach the Hall of Fame',
    read: (s, g) => {
      const score = legacyScore(s);
      const tier = tierOf(score);
      return { value: score, target: TIER_MIN[g.target], done: tier >= g.target, detail: `${Math.round(score)} of ${TIER_MIN[g.target]} points · ${TIER_LABELS[tier]}` };
    },
    fits: (s) => tierOf(legacyScore(s)) < 4,
  },
  {
    kind: 'surpass',
    group: 'career',
    icon: '🧬',
    targets: [],
    title: (_t, s) => `Out-achieve ${s.legacy.parent || 'your parent'}`,
    read: (s, g) => {
      const score = legacyScore(s);
      return { value: score, target: g.target, done: score >= g.target, detail: `${Math.round(score)} of ${g.target} points` };
    },
    fits: () => false, // only ever added by `ensureGoals` for an heir
  },
  {
    kind: 'ovr',
    group: 'player',
    icon: '📈',
    targets: [80, 85, 90],
    title: (t) => `Reach ${t} overall`,
    read: (s, g) => countDone(peakOf(s), g.target, `Best so far: ${peakOf(s)}`),
    fits: (s, t) => peakOf(s) < t - 2,
  },
  {
    kind: 'points',
    group: 'player',
    icon: '🎯',
    targets: [4000, 8000, 12000],
    title: (t) => `Score ${n(t)} career points`,
    read: (s, g) => countDone(careerTotals(s).pts, g.target, `${n(careerTotals(s).pts)} of ${n(g.target)}`),
    fits: (s, t) => careerTotals(s).pts < t * 0.6,
  },
  {
    kind: 'badges',
    group: 'player',
    icon: '🎖️',
    targets: [5, 8],
    title: (t) => `Earn ${t} badges`,
    read: (s, g) => countDone(s.player.badges.length, g.target, `${s.player.badges.length} of ${g.target}`),
    fits: (s, t) => s.player.badges.length < t,
  },
  {
    kind: 'draft',
    group: 'player',
    icon: '📋',
    targets: [5],
    title: () => 'Be a top-5 draft pick',
    read: (s) => {
      const pick = s.player.draftPick;
      const done = pick !== null && pick > 0 && pick <= 5;
      return { value: done ? 1 : 0, target: 1, done, detail: pick ? `Went #${pick}` : 'Not drafted yet' };
    },
    fits: (s) => s.career.level !== 'pro' && s.player.draftPick === null,
  },
  {
    kind: 'proyears',
    group: 'player',
    icon: '🗓️',
    targets: [10, 14],
    title: (t) => `Play ${t} seasons as a pro`,
    read: (s, g) => countDone(careerTotals(s).proSeasons, g.target, `${careerTotals(s).proSeasons} of ${g.target}`),
    fits: (s, t) => careerTotals(s).proSeasons < t - 3,
  },
  {
    kind: 'money',
    group: 'life',
    icon: '💰',
    targets: [20_000_000, 60_000_000, 150_000_000],
    title: (t) => `Build a ${money(t)} fortune`,
    read: (s, g) => countDone(s.player.money, g.target, `${money(Math.max(0, s.player.money))} of ${money(g.target)}`),
    fits: (s, t) => s.player.money < t * 0.4,
  },
  {
    kind: 'family',
    group: 'life',
    icon: '👨‍👩‍👧',
    targets: [1],
    title: () => 'Marry and raise a family',
    read: (s) => {
      const married = s.story.flags.love_stage === 'married';
      const kids = Number(s.story.flags.kids ?? 0);
      return { value: (married ? 1 : 0) + (kids > 0 ? 1 : 0), target: 2, done: married && kids > 0, detail: `${married ? 'Married' : 'Not married'} · ${kids} kid${kids === 1 ? '' : 's'}` };
    },
    fits: (s) => !(s.story.flags.love_stage === 'married' && Number(s.story.flags.kids ?? 0) > 0),
  },
  {
    kind: 'followers',
    group: 'life',
    icon: '📣',
    targets: [50_000, 250_000, 1_000_000],
    title: (t) => `Reach ${n(t)} followers`,
    read: (s, g) => countDone(s.player.followers, g.target, `${n(s.player.followers)} of ${n(g.target)}`),
    fits: (s, t) => s.player.followers < t * 0.3,
  },
  {
    kind: 'rival',
    group: 'life',
    icon: '🔥',
    targets: [4],
    title: (_t, s) => `Beat ${rivals(s)[0]?.name ?? 'your rival'} head to head`,
    read: (s, g) => {
      const best = rivals(s).reduce((m, r) => Math.max(m, r.h2h.w - r.h2h.l), -99);
      const r = rivals(s).find((q) => q.h2h.w - q.h2h.l === best);
      return { value: Math.max(0, best), target: g.target, done: !!r && r.h2h.w >= g.target && r.h2h.w - r.h2h.l >= 2, detail: r ? `${r.h2h.w}-${r.h2h.l} against ${r.name}` : 'No rival yet' };
    },
    fits: (s) => rivals(s).length > 0 && rivals(s).every((r) => r.h2h.w < 3),
  },
];

const DEF_BY_KIND = Object.fromEntries(DEFS.map((d) => [d.kind, d])) as Record<string, Def>;
const GROUPS: GoalGroup[] = ['career', 'player', 'life'];
const OPEN_AT_ONCE = 3;

export function viewGoal(state: GameState, g: Goal): GoalView | null {
  const d = DEF_BY_KIND[g.kind];
  if (!d) return null;
  const r = d.read(state, g);
  const done = g.doneSeason > 0 || r.done;
  return {
    id: g.id,
    kind: g.kind,
    group: d.group,
    icon: d.icon,
    title: d.title(g.target, state),
    detail: g.doneSeason > 0 ? `Done in season ${g.doneSeason}` : r.detail,
    value: r.value,
    target: r.target,
    pct: done ? 100 : Math.max(0, Math.min(99, Math.round((r.value / Math.max(1, r.target)) * 100))),
    done,
    doneSeason: g.doneSeason,
  };
}

export const openGoals = (state: GameState): GoalView[] => state.goals.filter((g) => g.doneSeason === 0).map((g) => viewGoal(state, g)).filter((v): v is GoalView => !!v);
export const doneGoals = (state: GameState): GoalView[] => state.goals.filter((g) => g.doneSeason > 0).map((g) => viewGoal(state, g)).filter((v): v is GoalView => !!v);

/** Picks goals with its own seeded generator, so choosing them never moves the game's random sequence. */
function goalRng(state: GameState): RNG {
  let h = 0x9e3779b1 ^ state.legacy.generation;
  for (const ch of state.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return new RNG((h ^ Math.imul(state.goals.length + 1, 40503)) >>> 0);
}

/** Top the open goals up to three, one per group where it can. Safe to call any time; does nothing when full. */
export function ensureGoals(state: GameState): Goal[] {
  const added: Goal[] = [];
  const season = state.career.season;
  const taken = (kind: string) => state.goals.some((g) => g.kind === kind);
  // an heir's first goal is to go further than the parent did
  const parentScore = state.legacy.lineage[state.legacy.lineage.length - 1]?.score ?? 0;
  if (state.legacy.generation > 1 && parentScore > 0 && !taken('surpass')) {
    const g: Goal = { id: `g${state.goals.length + 1}`, kind: 'surpass', target: Math.ceil(parentScore) + 1, doneSeason: 0, setSeason: season };
    state.goals.push(g);
    added.push(g);
  }
  // why the player plays decides the first goal they chase
  if (state.player.origin.chosen) {
    const kind = goalForMotive(state.player.origin.motive);
    const def = DEF_BY_KIND[kind];
    const target = def?.targets.find((t) => def.fits(state, t));
    if (def && target !== undefined && !taken(kind)) {
      const g: Goal = { id: `g${state.goals.length + 1}`, kind, target, doneSeason: 0, setSeason: season };
      state.goals.push(g);
      added.push(g);
    }
  }
  const rng = goalRng(state);
  let guard = 0;
  while (openGoals(state).length < OPEN_AT_ONCE && guard++ < 12) {
    const open = openGoals(state);
    // prefer a group that has nothing open yet
    const empty = GROUPS.filter((gr) => !open.some((o) => o.group === gr));
    const groups = empty.length ? empty : GROUPS;
    const cands = DEFS.filter((d) => groups.includes(d.group) && !taken(d.kind)).flatMap((d) => d.targets.filter((t) => d.fits(state, t)).map((t) => ({ d, t })));
    if (!cands.length) {
      // that group is used up; try anything left
      const any = DEFS.filter((d) => !taken(d.kind)).flatMap((d) => d.targets.filter((t) => d.fits(state, t)).map((t) => ({ d, t })));
      if (!any.length) break;
      const pick = rng.pick(any);
      const g: Goal = { id: `g${state.goals.length + 1}`, kind: pick.d.kind, target: pick.t, doneSeason: 0, setSeason: season };
      state.goals.push(g);
      added.push(g);
      continue;
    }
    // within a kind, the middle target is the most likely: ambitious but not absurd
    const pick = rng.pick(cands);
    const g: Goal = { id: `g${state.goals.length + 1}`, kind: pick.d.kind, target: pick.t, doneSeason: 0, setSeason: season };
    state.goals.push(g);
    added.push(g);
  }
  return added;
}

/** Marks goals that are now met, files the news, and brings in the next ones. Returns what was just finished. */
export function checkGoals(state: GameState): GoalView[] {
  const finished: GoalView[] = [];
  for (const g of state.goals) {
    if (g.doneSeason > 0) continue;
    const d = DEF_BY_KIND[g.kind];
    if (!d || !d.read(state, g).done) continue;
    g.doneSeason = state.career.season;
    const v = viewGoal(state, g);
    if (v) {
      finished.push(v);
      addNews(state, `Goal reached: ${v.title}.`);
    }
  }
  if (finished.length) ensureGoals(state);
  return finished;
}
