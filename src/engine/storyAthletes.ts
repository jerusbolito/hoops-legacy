import type { Athlete, GameState, Level, Npc, NpcSeason } from '../state/schemas';
import { RATING_KEYS } from '../state/schemas';
import { makeNpc } from './generate';
import { teamRoster } from './league';
import { addNews } from './news';
import { overall } from './ratings';
import { RNG, clamp } from './rng';

/**
 * Your rival and your best friend are people with careers of their own. Each year they move up a class, win or lose
 * minutes, and grow into the player they were promised to be, so a senior rival does not read like a freshman and does
 * not sit at the end of the bench. Everything here is engine math; the narrator only gets to tell it.
 */

const HS_CLASS = ['Freshman', 'Sophomore', 'Junior', 'Senior'];

/** Class year from age: 14 is a high school freshman, 18 a college freshman. Pros get a career stage instead. */
export function classLabel(level: Level, age: number): string {
  if (level === 'hs') return HS_CLASS[clamp(age - 14, 0, 3)];
  if (level === 'college') return HS_CLASS[clamp(age - 18, 0, 3)];
  return age <= 22 ? 'Young' : age >= 31 ? 'Veteran' : 'Prime-age';
}

/** The kind of player a rank on the depth chart makes someone (1 = best on the team). */
export function rosterRole(rank: number): string {
  return rank === 1 ? 'star' : rank <= 3 ? 'top-three scorer' : rank <= 5 ? 'starter' : rank <= 8 ? 'rotation player' : 'bench player';
}

const rosterOf = (state: GameState, teamId: string | null): Athlete[] => (teamId ? (state.teams[teamId]?.rosterIds ?? []).map((id) => state.athletes[id]).filter(Boolean) : []);

/** Where an athlete ranks on their own team by rating, 1 = best. 0 if they have no team. */
export function teamRank(state: GameState, a: Athlete): number {
  if (!a.teamId) return 0;
  const sorted = [...rosterOf(state, a.teamId)].sort((x, y) => overall(y.ratings) - overall(x.ratings));
  const i = sorted.findIndex((x) => x.id === a.id);
  return i < 0 ? 0 : i + 1;
}

/** The player and everyone an NPC is built on: only story rules may move them. */
export function lockedAthleteIds(state: GameState): Set<string> {
  const ids = new Set<string>([state.player.athleteId]);
  for (const n of Object.values(state.npcs)) if (n.athleteId) ids.add(n.athleteId);
  return ids;
}

/** Story athletes: the characters who also play on a court. */
export function storyAthletes(state: GameState): Npc[] {
  return Object.values(state.npcs).filter((n) => n.active && n.athleteId && state.athletes[n.athleteId] && (n.role === 'rival' || n.role === 'friend' || n.role === 'teammate'));
}

/** Their line so far this season (or null before they have played). */
export function currentLine(state: GameState, athleteId: string): { gp: number; ppg: number; rpg: number; apg: number; mpg: number } | null {
  const s = state.leagueStats[athleteId];
  if (!s || s.gp <= 0) return null;
  return { gp: s.gp, ppg: s.pts / s.gp, rpg: s.reb / s.gp, apg: s.ast / s.gp, mpg: s.min / s.gp };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface AthleteStatus {
  cls: string;
  rank: number;
  role: string;
  teamName: string | null;
  /** This season if they have played, otherwise last season. */
  line: { ppg: number; rpg: number; apg: number; mpg: number; label: string } | null;
}

/** A readable status for a story athlete, for the People page and the narrator. */
export function athleteStatus(state: GameState, n: Npc): AthleteStatus | null {
  const a = n.athleteId ? state.athletes[n.athleteId] : undefined;
  if (!a) return null;
  const level = state.career.level;
  const rank = teamRank(state, a);
  const now = currentLine(state, a.id);
  const last = n.lastSeason;
  const line = now ? { ppg: now.ppg, rpg: now.rpg, apg: now.apg, mpg: now.mpg, label: 'this season' } : last ? { ppg: last.ppg, rpg: last.rpg, apg: last.apg, mpg: last.mpg, label: 'last season' } : null;
  return { cls: classLabel(level, a.age), rank, role: rank ? rosterRole(rank) : 'no team', teamName: a.teamId ? state.teams[a.teamId]?.name ?? null : null, line };
}

export function statusText(s: AthleteStatus): string {
  const stat = s.line ? `${r1(s.line.ppg)} ppg, ${r1(s.line.mpg)} mpg ${s.line.label}` : '';
  return [s.cls, s.role, stat].filter(Boolean).join(' · ');
}

/* ───────────────────────── Season turn ───────────────────────── */

/** Before the stats reset: file away how everyone did, add it to what they remember, and report on the rival. */
export function recordStorySeasons(state: GameState) {
  const season = state.career.season;
  for (const n of storyAthletes(state)) {
    const a = state.athletes[n.athleteId!];
    const line = currentLine(state, a.id);
    if (!line || !a.teamId) continue;
    const rec: NpcSeason = { season, teamName: state.teams[a.teamId]?.name ?? '', gp: line.gp, ppg: r1(line.ppg), rpg: r1(line.rpg), apg: r1(line.apg), mpg: r1(line.mpg), rank: teamRank(state, a) };
    n.lastSeason = rec;
    if (n.role === 'rival' || n.role === 'friend') {
      n.memories.push(`Season ${season}: ${rec.ppg} ppg, ${rec.rpg} rpg for ${rec.teamName}${rec.rank <= 2 ? ', one of their best players' : rec.rank >= 8 ? ', mostly a bench player' : ''}.`);
      if (n.memories.length > 8) n.memories.shift();
      if (n.role === 'rival') addNews(state, `${a.firstName} ${a.lastName} finishes the season at ${rec.teamName}: ${rec.ppg} ppg, ${rec.rpg} rpg.`);
    }
  }
}

/** How good a story athlete should be by now, so they stay in the picture: rank on their team and a rating near yours. */
function targetFor(state: GameState, n: Npc, a: Athlete, rng: RNG): number {
  const level = state.career.level;
  const me = state.athletes[state.player.athleteId];
  const mine = overall(me.ratings);
  // class years the athlete has played at this level
  const yearIn = clamp(a.age - (level === 'hs' ? 14 : level === 'college' ? 18 : 22), 0, 3);
  let target = n.role === 'rival' ? mine + 1 + rng.range(-1.5, 2.5) : mine + rng.range(-2, 3);
  // a phenom works their way up their own depth chart; a best friend earns a spot too
  const wantRank = n.role === 'rival' ? [6, 4, 3, 2][yearIn] : [6, 5, 4, 3][yearIn];
  const others = rosterOf(state, a.teamId)
    .filter((x) => x.id !== a.id)
    .map((x) => overall(x.ratings))
    .sort((x, y) => y - x);
  const need = others[wantRank - 1];
  if (need !== undefined) target = Math.max(target, need + 1);
  // but never so far ahead of you that the rivalry stops being a contest
  return Math.min(target, mine + (n.role === 'rival' ? 10 : 7));
}

/** Shift every rating of an athlete by about the same amount. */
function shiftAll(a: Athlete, amount: number, rng: RNG) {
  for (const k of RATING_KEYS) a.ratings[k] = clamp(a.ratings[k] + Math.round(amount + rng.normal(0, 0.5)), 10, 99);
}

/**
 * Off-season: lift a rival or friend who has fallen behind the story, and rein in one who has run far ahead of you.
 * They still grow the normal way first (developNpcs); this only keeps them in the picture.
 */
export function developStoryAthletes(state: GameState, rng: RNG) {
  for (const n of storyAthletes(state)) {
    if (n.role !== 'rival' && n.role !== 'friend') continue;
    const a = state.athletes[n.athleteId!];
    const ovr = overall(a.ratings);
    const target = targetFor(state, n, a, rng);
    const gap = target - ovr;
    if (gap > 0.5) shiftAll(a, Math.min(6, gap * 0.8), rng);
    else if (gap < -8) shiftAll(a, -Math.min(3, (-gap - 8) * 0.4), rng);
  }
}

/** The current descriptive title of a story athlete, from where they really are now. */
export function storyTitle(state: GameState, n: Npc): string | null {
  const st = athleteStatus(state, n);
  const a = n.athleteId ? state.athletes[n.athleteId] : undefined;
  if (!st || !a) return null;
  const level = state.career.level;
  const where = st.teamName ? ` at ${st.teamName}` : '';
  const stat = n.lastSeason ? ` (${n.lastSeason.ppg} ppg last season)` : '';
  const sameTeam = a.teamId === state.career.teamId;
  if (n.role === 'rival') {
    if (!a.teamId) return `Your rival, ${level === 'college' ? 'gone pro' : 'no longer in your league'}`;
    const first = st.cls === 'Freshman' && st.rank > 0 && st.rank <= 3 ? 'phenom' : st.role;
    return `${st.cls} ${first}${where}${stat}`;
  }
  if (n.role === 'friend') {
    if (!a.teamId) return 'Your best friend, no longer in the league';
    const bond = 'your best friend since middle school';
    return sameTeam ? `${st.cls} ${a.position} on your team, ${bond}` : `${st.cls} ${a.position}${where}, ${bond}${stat}`;
  }
  return null;
}

/** Bring every rival and friend's title up to date (new class year, new team, new role). */
export function refreshStoryTitles(state: GameState) {
  for (const n of storyAthletes(state)) {
    if (n.role !== 'rival' && n.role !== 'friend') continue;
    const t = storyTitle(state, n);
    if (t) n.title = t;
  }
}

/** If the last teammate character left, the team's best remaining veteran steps into that role. */
export function promoteTeammate(state: GameState, rng: RNG) {
  const hasTeammate = Object.values(state.npcs).some((n) => n.active && n.role === 'teammate' && n.athleteId && state.athletes[n.athleteId]?.teamId === state.career.teamId);
  if (hasTeammate) return;
  const level = state.career.level;
  const team = state.teams[state.career.teamId];
  const me = state.athletes[state.player.athleteId];
  const mate = teamRoster(state, team.id)
    .filter((a) => a.id !== me.id && !a.persistent && !Object.values(state.npcs).some((n) => n.athleteId === a.id))
    .sort((a, b) => b.age - a.age || overall(b.ratings) - overall(a.ratings))[0];
  if (!mate) return;
  const sameSpot = mate.position === me.position;
  const npc = makeNpc(rng, {
    name: `${mate.firstName} ${mate.lastName}`,
    role: 'teammate',
    title: level === 'pro' ? `Veteran teammate at ${team.name}` : `${sameSpot ? 'Upperclassman competing for your minutes' : 'Upperclassman leader'} at ${team.name}`,
    season: state.career.season + 1,
    athleteId: mate.id,
    rel: { affinity: 0, respect: 25, trust: 15, rivalry: sameSpot ? 10 : 0 },
  });
  state.npcs[npc.id] = npc;
}

/**
 * Saves made before rivals and friends had careers of their own: bring them up to date once, the first time the save
 * opens. A rival who is still "a freshman phenom" in senior year gets their class year, a real role and the growth they
 * missed; a best friend who is older than you (and would graduate early) joins your class.
 */
export function upgradeSave(state: GameState): boolean {
  if (state.story.flags.story_athletes_v2 === true) return false;
  state.story.flags.story_athletes_v2 = true;
  const me = state.athletes[state.player.athleteId];
  if (state.career.level === 'hs') {
    for (const n of storyAthletes(state)) {
      if (n.role === 'friend') {
        const a = state.athletes[n.athleteId!];
        if (a.age > me.age) a.age = me.age;
      }
    }
  }
  // a throwaway generator keyed to the save, so opening a save never disturbs the game's own random sequence
  const rng = new RNG((state.createdAt ^ Math.imul(state.career.season, 40503) ^ 0x5eed) >>> 0);
  // one catch-up for every class year they should have grown through
  const years = clamp(state.career.year - 1, 0, 3);
  for (let i = 0; i < Math.max(1, years); i++) developStoryAthletes(state, rng);
  refreshStoryTitles(state);
  return true;
}
