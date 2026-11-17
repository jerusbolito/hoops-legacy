import { COLLEGE_TEAMS } from '../data/teams';
import type { Athlete, GameState, RecruitTarget, Suitor } from '../state/schemas';
import { scaled, spend } from './finance';
import { logTransaction } from './news';
import { overall } from './ratings';
import { RNG, clamp } from './rng';
import { lockedAthleteIds } from './storyAthletes';
import { seasonAverages } from './stats';

/**
 * Recruiting, both ways. Schools want you: a board of suitors whose interest follows how you play. You want players:
 * each season a few targets from other teams (or soon-to-be free agents in the pros), and you spend your recruiting
 * actions on calls, visits, hype and perks while rival teams chase the same players. The decision comes at the turn of
 * the season. Everything is engine math; the narrator only gets to tell it.
 */

export const MAX_POINTS = 4;
const GRADUATION_AGE = { hs: 18, college: 22, pro: 99 } as const;

const first = (a: Athlete) => `${a.firstName} ${a.lastName}`;
const roster = (state: GameState, teamId: string): Athlete[] => (state.teams[teamId]?.rosterIds ?? []).map((id) => state.athletes[id]).filter(Boolean);

/** Recruiting runs through the season and the summer after it. */
export function recruitingOpen(state: GameState): boolean {
  const p = state.career.phase;
  return p === 'preseason' || p === 'regular' || p === 'playoffs' || p === 'offseason';
}

/* ───────────────────────── Schools that want you ───────────────────────── */

/** How big a name you are right now: rating, scoring and reputation. */
function starScore(state: GameState): number {
  const me = state.athletes[state.player.athleteId];
  const avg = seasonAverages(state.gameLog, state.career.season);
  return overall(me.ratings) + avg.ppg * 0.4 + state.player.reputation * 0.1;
}

export function suitorOf(state: GameState, name: string): Suitor | undefined {
  return state.recruiting.suitors.find((s) => s.name === name);
}

export function topSuitor(state: GameState): Suitor | undefined {
  return [...state.recruiting.suitors].sort((a, b) => b.interest - a.interest)[0];
}

/** Change how much a school wants you. Returns the new level. */
export function bumpSuitor(state: GameState, name: string, delta: number, opts: { contact?: boolean; visited?: boolean } = {}): number {
  const s = suitorOf(state, name);
  if (!s) return 0;
  s.interest = clamp(Math.round(s.interest + delta), 0, 100);
  if (opts.contact) s.contacts++;
  if (opts.visited) s.visited = true;
  return s.interest;
}

/** Schools that can court the player now: colleges for a high schooler, other programs for a college player. */
function courtingPool(state: GameState): { name: string; prestige: number }[] {
  const c = state.career;
  if (c.level === 'hs') return c.year >= 2 ? COLLEGE_TEAMS.map((t) => ({ name: t.name, prestige: t.prestige })) : [];
  if (c.level === 'college') return state.league.teamIds.filter((id) => id !== c.teamId).map((id) => ({ name: state.teams[id].name, prestige: state.teams[id].prestige }));
  return [];
}

/** Weekly: new schools take notice, interest follows your play, and quiet schools drift away. */
function updateSuitors(state: GameState, rng: RNG) {
  const r = state.recruiting;
  const star = starScore(state);
  const level = state.career.level;
  // how far up the ladder a school will reach for you
  const reach = level === 'hs' ? clamp((star - 45) * 3.2 + 40, 30, 100) : clamp((star - 60) * 3 + 45, 30, 100);
  // scoring builds interest; a quiet stretch lets it fade
  const ppg = seasonAverages(state.gameLog, state.career.season).ppg;
  const form = clamp((ppg - 8) / 10, -0.5, 1.6);
  for (const s of r.suitors) {
    s.interest = clamp(s.interest + form * 1.3 + (star >= 50 ? 0.5 : 0) - 0.9 + rng.range(-1.2, 1.4), 0, 100);
  }
  r.suitors = r.suitors.filter((s) => s.interest >= 4);
  if (r.suitors.length < 6 && rng.chance(clamp(0.1 + (star - 45) / 80, 0.05, 0.45))) {
    const taken = new Set(r.suitors.map((s) => s.name));
    const pool = courtingPool(state).filter((t) => !taken.has(t.name) && t.prestige <= reach + 4);
    if (pool.length) {
      const t = rng.weighted(pool, (x) => 0.4 + x.prestige / 60);
      r.suitors.push({ name: t.name, interest: Math.round(rng.range(18, 34)), contacts: 0, visited: false });
    }
  }
}

/* ───────────────────────── Players you want ───────────────────────── */

const teamAppeal = (state: GameState): number => {
  const t = state.teams[state.career.teamId];
  const st = state.league.standings[t.id];
  const pct = st ? st.w / Math.max(1, st.w + st.l) : 0.5;
  return clamp(0.7 + pct * 0.6 + (t.prestige - 50) / 200, 0.5, 1.5);
};

/** Pick this season's targets. Called when a season begins. */
export function refreshTargets(state: GameState, rng: RNG) {
  const c = state.career;
  const locked = lockedAthleteIds(state);
  const mine = c.teamId;
  const pool: Athlete[] = [];
  for (const id of state.league.teamIds) {
    if (id === mine) continue;
    for (const a of roster(state, id)) {
      if (locked.has(a.id) || a.persistent) continue;
      if (c.level === 'pro') {
        a.contractYears ??= rng.int(1, 4);
        if (a.contractYears !== 1 || a.age >= 35) continue;
      } else if (a.age + 1 >= GRADUATION_AGE[c.level]) continue;
      pool.push(a);
    }
  }
  pool.sort((a, b) => overall(b.ratings) - overall(a.ratings));
  const picks: Athlete[] = [];
  const band = (lo: number, hi: number) => {
    const slice = pool.slice(lo, hi).filter((a) => !picks.includes(a));
    if (slice.length) picks.push(rng.pick(slice));
  };
  band(0, 4); // a star
  band(4, 12); // a riser
  band(12, 26); // a sleeper
  const others = state.league.teamIds.filter((id) => id !== mine);
  state.recruiting.targets = picks.map((a): RecruitTarget => {
    const from = state.teams[a.teamId!];
    const rivals = rng.shuffle(others.filter((id) => id !== a.teamId)).slice(0, rng.int(1, 2)).map((teamId) => ({ teamId, pull: Math.round(rng.range(14, 38) + (state.teams[teamId].prestige - 50) / 5) }));
    const rank = pool.indexOf(a);
    return {
      athleteId: a.id,
      name: first(a),
      position: a.position,
      fromTeam: from.name,
      pull: 0,
      contacts: 0,
      rivals,
      note: rank < 4 ? `One of the best ${a.position}s in the league.` : rank < 12 ? `A rising ${a.position} at ${from.name}.` : `An under-the-radar ${a.position} who could grow.`,
    };
  });
  state.recruiting.points = Math.max(state.recruiting.points, 2);
}

export const targetAthlete = (state: GameState, t: RecruitTarget): Athlete | undefined => state.athletes[t.athleteId];

/** What a target would mean for you: a better teammate, or a threat to your minutes. */
export function roleRisk(state: GameState, t: RecruitTarget): 'threat' | 'even' | 'upgrade' {
  const a = targetAthlete(state, t);
  if (!a) return 'even';
  const me = state.athletes[state.player.athleteId];
  const d = overall(a.ratings) - overall(me.ratings);
  if (d >= 3 && a.position === me.position) return 'threat';
  return d >= 5 ? 'upgrade' : 'even';
}

export type RecruitAction = 'call' | 'visit' | 'hype' | 'perks';

export const RECRUIT_ACTIONS: { id: RecruitAction; label: string; blurb: string }[] = [
  { id: 'call', label: 'Call or text', blurb: 'Talk basketball. Small, steady, free.' },
  { id: 'visit', label: 'Host a visit', blurb: 'Show them the gym and the team. Works better when your team is winning. Costs energy.' },
  { id: 'hype', label: 'Hype them up publicly', blurb: 'Post about them and tag your team. Works better the bigger your name is.' },
  { id: 'perks', label: 'Treat them', blurb: 'Dinner, gear, a day out. Costs money, and it works.' },
];

export const perksPrice = (state: GameState): number => scaled(state, 150);

export interface ActionResult {
  ok: boolean;
  message: string;
  gain: number;
}

/** Spend one recruiting action on a target. */
export function recruitAct(state: GameState, rng: RNG, athleteId: string, action: RecruitAction): ActionResult {
  const r = state.recruiting;
  const t = r.targets.find((x) => x.athleteId === athleteId);
  const p = state.player;
  if (!t || !targetAthlete(state, t)) return { ok: false, message: 'That player is no longer on the board.', gain: 0 };
  if (!recruitingOpen(state)) return { ok: false, message: 'Not right now.', gain: 0 };
  if (r.points < 1) return { ok: false, message: 'You are out of recruiting actions. You get another each week.', gain: 0 };
  if (action === 'hype' && p.followers < 100) return { ok: false, message: 'You need a bigger following for that to matter.', gain: 0 };
  if (action === 'perks' && p.money < perksPrice(state)) return { ok: false, message: 'You cannot afford that yet.', gain: 0 };
  if (action === 'visit' && p.energy < 12) return { ok: false, message: 'You are too worn out to host anyone.', gain: 0 };

  const nm = t.name.split(' ')[0];
  let base = 0;
  let msg = '';
  if (action === 'call') {
    base = rng.range(6, 11);
    p.energy = clamp(p.energy - 2, 0, 100);
    msg = `You talk hoops for an hour. ${nm} says they will think about it.`;
  } else if (action === 'visit') {
    base = rng.range(12, 20) * teamAppeal(state);
    p.energy = clamp(p.energy - 8, 0, 100);
    msg = `You show ${nm} the gym, introduce them to the team and take them out after. They look like they could picture it.`;
  } else if (action === 'hype') {
    base = rng.range(5, 14) * clamp(0.4 + p.reputation / 50 + p.followers / 20000, 0.4, 1.8);
    p.energy = clamp(p.energy - 3, 0, 100);
    msg = `Your post about ${nm} gets a lot of attention. They like it, and so do a few hundred strangers.`;
  } else {
    spend(state, perksPrice(state));
    base = rng.range(14, 20);
    msg = `You take ${nm} out and cover everything. They are not hard to impress.`;
  }
  const gain = Math.round(base * 0.8 * (1 - t.pull / 130) * 10) / 10;
  t.pull = clamp(Math.round((t.pull + gain) * 10) / 10, 0, 100);
  t.contacts++;
  r.points--;
  // the first real contact opens a storyline the narrator can follow
  if (t.contacts === 1 && !t.arcId && state.story.arcs.filter((a) => a.status === 'open').length < 4) {
    const arc = { id: `arc_${state.story.arcs.length + 1}`, title: `Recruiting ${t.name}`, stakes: `You want ${t.name} (${t.position}, ${t.fromTeam}) on your team, and other programs want them too.`, npcIds: [], openedSeason: state.career.season, status: 'open' as const };
    state.story.arcs.push(arc);
    t.arcId = arc.id;
  }
  return { ok: true, message: msg, gain };
}

/** A chance to add pull from the outside (a coach's help, a teammate's word). */
export function bumpTarget(state: GameState, athleteId: string | undefined, delta: number): RecruitTarget | undefined {
  const t = athleteId ? state.recruiting.targets.find((x) => x.athleteId === athleteId) : state.recruiting.targets[0];
  if (t) t.pull = clamp(Math.round((t.pull + delta * (1 - t.pull / 130)) * 10) / 10, 0, 100);
  return t;
}

/** Who a target picks: you, a rival team, or staying put. */
export function recruitWinner(state: GameState, rng: RNG, t: RecruitTarget, proFreeAgent = false): 'user' | 'stay' | string {
  const mine = state.teams[state.career.teamId];
  const from = state.athletes[t.athleteId]?.teamId ? state.teams[state.athletes[t.athleteId].teamId!] : undefined;
  const noise = () => rng.normal(0, 7);
  let best: { who: string; score: number } = { who: 'user', score: t.pull + (mine.prestige - 50) * 0.35 + noise() };
  const stay = (proFreeAgent ? 18 : 32) + ((from?.prestige ?? 50) - 50) * 0.3 + noise();
  if (stay > best.score) best = { who: 'stay', score: stay };
  for (const rv of t.rivals) {
    const s = rv.pull + (state.teams[rv.teamId].prestige - 50) * 0.35 + noise();
    if (s > best.score) best = { who: rv.teamId, score: s };
  }
  return best.who;
}

/* ───────────────────────── The week, and the league around you ───────────────────────── */

/** Called as each new week begins. */
export function tickRecruiting(state: GameState, rng: RNG) {
  const r = state.recruiting;
  const c = state.career;
  r.points = Math.min(MAX_POINTS, r.points + (c.phase === 'regular' || c.phase === 'preseason' ? 1 : 0));
  for (const t of r.targets) {
    // rival teams keep working; if you go quiet, your own pull fades a little
    for (const rv of t.rivals) rv.pull = clamp(rv.pull + rng.range(0.8, 3.4) * (state.teams[rv.teamId].prestige / 60), 0, 100);
    t.pull = clamp(t.pull - 0.8, 0, 100);
  }
  if (c.phase === 'regular' || c.phase === 'offseason') {
    if (c.level === 'hs' || c.level === 'college') updateSuitors(state, rng);
    leagueBuzz(state, rng);
  }
}

/** Headlines about other players being courted. The league talks about more than you. */
function leagueBuzz(state: GameState, rng: RNG) {
  if (!rng.chance(0.28)) return;
  const locked = lockedAthleteIds(state);
  const all = state.league.teamIds.flatMap((id) => roster(state, id)).filter((a) => !locked.has(a.id) && !a.persistent);
  const stars = all.sort((a, b) => overall(b.ratings) - overall(a.ratings)).slice(0, 10);
  if (!stars.length) return;
  const a = rng.pick(stars);
  const from = state.teams[a.teamId!];
  const suitors = state.league.teamIds.filter((id) => id !== a.teamId);
  const n = rng.int(2, 4);
  const names = rng.shuffle([...suitors]).slice(0, 2).map((id) => state.teams[id].name);
  const text =
    state.career.level === 'pro'
      ? rng.pick([`${first(a)} could be on the move. ${names[0]} and ${names[1] ?? 'others'} are said to be circling.`, `Front offices are watching ${first(a)}. ${names[0]} want a conversation.`])
      : rng.pick([`${first(a)}, ${from.name}'s ${a.position}, is hearing from ${n} programs.`, `A scout from ${names[0]} was at ${from.name}'s game to see ${first(a)}.`, `${first(a)} is on ${names[0]}'s board, sources say.`]);
  logTransaction(state, 'recruit', text);
}

/** When the high school class leaves, the league's best seniors announce where they are going. */
export function classCommitNews(state: GameState, rng: RNG) {
  if (state.career.level !== 'hs') return;
  const locked = lockedAthleteIds(state);
  const seniors = state.league.teamIds
    .flatMap((id) => roster(state, id))
    .filter((a) => a.age >= GRADUATION_AGE.hs && !locked.has(a.id))
    .sort((a, b) => overall(b.ratings) - overall(a.ratings))
    .slice(0, 3);
  for (const a of seniors) {
    const college = rng.weighted(COLLEGE_TEAMS, (t) => 0.3 + (t.prestige / 100) ** 2 * (overall(a.ratings) / 55));
    a.committedTo = college.name;
    logTransaction(state, 'recruit', `${first(a)}, the ${state.teams[a.teamId!].name} senior ${a.position}, commits to ${college.name}.`);
  }
}

/** A short line for the narrator on who is recruiting whom right now. */
export function recruitingBlock(state: GameState): string | null {
  const r = state.recruiting;
  const lines: string[] = [];
  const suitors = [...r.suitors].filter((s) => s.interest >= 25).sort((a, b) => b.interest - a.interest).slice(0, 3);
  if (suitors.length) lines.push(`Schools interested in the player: ${suitors.map((s) => `${s.name} (${Math.round(s.interest)}/100${s.visited ? ', has visited' : ''})`).join(', ')}.`);
  const targets = r.targets.filter((t) => t.contacts > 0).slice(0, 3);
  if (targets.length) lines.push(`The player is recruiting: ${targets.map((t) => `${t.name} of ${t.fromTeam} (${Math.round(t.pull)}/100 sold, ${t.rivals.length} rival team${t.rivals.length > 1 ? 's' : ''} chasing)`).join('; ')}.`);
  return lines.length ? lines.join(' ') : null;
}
