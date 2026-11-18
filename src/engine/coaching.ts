import type { Athlete, Coaching, CoachSeason, GameState, RatingKey } from '../state/schemas';
import { RATING_KEYS } from '../state/schemas';
import { scoredPlayers } from './awards';
import { ageEveryone, turnoverRosters, withRng } from './career';
import { archiveSeasonStats } from './leaders';
import { advancePlayoffs, createLeague, currentPlayoffRound, seedPlayoffs, simOtherGames, sortedStandings, teamRoster } from './league';
import { tierOf } from './legacyScore';
import { legacyScore } from './legacyScore';
import { addNews } from './news';
import { developNpcs } from './progression';
import { overall } from './ratings';
import { recordSeasonHonors } from './honors';
import { closeSeasonRecords } from './records';
import { RNG, clamp } from './rng';
import { leagueInSeasonTrades, leagueOffseasonMoves } from './transactions';

/**
 * Coaching: after a pro career ends, the retired player can take a job running a team. The league keeps going
 * on the same engine; the coach's part is the philosophy and what the staff drills, and their reputation shades how
 * the roster plays (see coachingMods.ts). Win and the offers get better; lose for long enough and they let you go.
 */

export type Philosophy = Coaching['philosophy'];

export const PHILOSOPHIES: { id: Philosophy; label: string; blurb: string }[] = [
  { id: 'win_now', label: 'Win now', blurb: 'Veterans play above themselves this season. The young players barely develop.' },
  { id: 'balanced', label: 'Balanced', blurb: 'No edge in games and a little development for the young players.' },
  { id: 'develop', label: 'Develop', blurb: 'Young players grow fast in the offseason. They are asked to carry less in games, so the record can suffer.' },
];

export const FIRING_REP = 18;
/** A coach who is let go keeps a little name, so one bad stretch is not the end of the career. */
export const FIRED_REP_FLOOR = 30;

export const canStartCoaching = (s: GameState): boolean => s.career.phase === 'retired' && s.career.level === 'pro' && !s.coaching.active;

/** Pro teams from best to worst by prestige. */
function ranked(s: GameState): string[] {
  return [...s.league.teamIds].sort((a, b) => s.teams[b].prestige - s.teams[a].prestige);
}

/** Three jobs. A famous player is offered contenders; a journeyman gets the rebuilds. */
export function coachingOffers(s: GameState, rep = s.coaching.rep): string[] {
  const order = ranked(s);
  const n = order.length;
  // rep 0 -> bottom third, rep 100 -> top
  const center = Math.round((1 - clamp(rep, 0, 100) / 100) * (n - 1));
  const lo = clamp(center - 1, 0, Math.max(0, n - 3));
  return order.slice(lo, lo + 3);
}

export const startingRep = (s: GameState): number => Math.round(clamp(28 + tierOf(legacyScore(s)) * 9, 0, 100));

/** Takes the retired player off the court and opens the coaching career at the job board. */
export function startCoaching(s: GameState): boolean {
  if (!canStartCoaching(s)) return false;
  const a = s.athletes[s.player.athleteId];
  // the player is no longer on a roster
  for (const t of Object.values(s.teams)) t.rosterIds = t.rosterIds.filter((id) => id !== a.id);
  a.teamId = null;
  s.coaching = { ...s.coaching, active: true, stage: 'offers', rep: startingRep(s), history: [], teamId: '', philosophy: 'balanced', focus: 'shooting', offers: [] };
  s.coaching.offers = coachingOffers(s);
  // the league moves on to a fresh season before the first job
  withRng(s, (rng) => rollLeague(s, rng, false));
  s.coaching.offers = coachingOffers(s);
  addNews(s, `${a.firstName} ${a.lastName} is ready to coach, and teams are calling.`);
  return true;
}

/** Hangs up the whistle. The retired screen (and the next generation) comes back. */
export function stopCoaching(s: GameState) {
  s.coaching.active = false;
  s.coaching.stage = 'offers';
  s.coaching.teamId = '';
}

export function takeJob(s: GameState, teamId: string): boolean {
  const c = s.coaching;
  if (!c.active || c.stage !== 'offers' || !c.offers.includes(teamId)) return false;
  c.teamId = teamId;
  c.stage = 'offseason';
  c.offers = [];
  s.career.teamId = teamId;
  const a = s.athletes[s.player.athleteId];
  addNews(s, `${s.teams[teamId].name} hire ${a.firstName} ${a.lastName} as head coach.`);
  return true;
}

export function setPhilosophy(s: GameState, p: Philosophy, focus: RatingKey = s.coaching.focus): boolean {
  if (!s.coaching.active || s.coaching.stage !== 'offseason' || !RATING_KEYS.includes(focus)) return false;
  s.coaching.philosophy = p;
  s.coaching.focus = focus;
  return true;
}

/** What the front office expects: a better team is expected to win more. */
export const expectedWinPct = (prestige: number): number => clamp(0.5 + ((prestige - 50) / 100) * 0.4, 0.3, 0.7);

export type CoachResult = CoachSeason['result'];

function resultFor(s: GameState, teamId: string): CoachResult {
  const lg = s.league;
  if (lg.champion === teamId) return 'champion';
  const final = lg.schedule.filter((g) => g.playoffRound === currentPlayoffRound(lg));
  if (final.some((g) => g.homeId === teamId || g.awayId === teamId)) return 'finalist';
  if (lg.schedule.some((g) => g.playoffRound && (g.homeId === teamId || g.awayId === teamId))) return 'playoffs';
  return 'missed';
}

export interface SeasonReport {
  season: SeasonRow;
  champion: string;
  mvp: string;
  messages: string[];
}
type SeasonRow = CoachSeason;

/** Plays the whole season: the regular season, the playoffs, and the reputation that follows. */
export function playSeason(s: GameState): SeasonReport | null {
  const c = s.coaching;
  if (!c.active || c.stage !== 'offseason' || !c.teamId) return null;
  return withRng(s, (rng) => {
    const lg = s.league;
    for (let w = 1; w <= lg.regularWeeks; w++) {
      simOtherGames(s, rng, w, '__none__');
      if (w % 3 === 0) leagueInSeasonTrades(s, rng);
    }
    seedPlayoffs(lg, rng);
    let guard = 0;
    while (!lg.champion && guard++ < 10) {
      const round = currentPlayoffRound(lg);
      const week = lg.schedule.find((g) => g.playoffRound === round)?.week ?? lg.regularWeeks + 1;
      simOtherGames(s, rng, week, '__none__', true);
      advancePlayoffs(lg, rng);
    }
    closeSeasonRecords(s);
    const scored = scoredPlayers(s);
    recordSeasonHonors(s, scored);

    const team = s.teams[c.teamId];
    const st = lg.standings[c.teamId];
    const games = Math.max(1, st.w + st.l);
    const winPct = st.w / games;
    const result = resultFor(s, c.teamId);
    const bonus = { champion: 10, finalist: 5, playoffs: 2, missed: -2 }[result];
    const delta = Math.round((winPct - expectedWinPct(team.prestige)) * 40 + bonus);
    c.rep = clamp(c.rep + delta, 0, 100);
    const tenure = c.history.filter((h) => h.teamId === c.teamId).length + 1;
    const fired = c.rep < FIRING_REP && tenure >= 2 && result === 'missed';
    const row: CoachSeason = { season: s.career.season, teamId: c.teamId, teamName: team.name, w: st.w, l: st.l, result, rep: c.rep, fired };
    c.history.push(row);
    c.stage = 'review';

    const champ = lg.champion ? s.teams[lg.champion].name : '';
    const mvpA = scored[0] ? s.athletes[scored[0].id] : null;
    const mvp = mvpA ? `${mvpA.firstName} ${mvpA.lastName}` : '';
    const messages = [`${team.name} finish ${st.w}-${st.l}.`, result === 'champion' ? 'CHAMPIONS! Your team won the title.' : result === 'finalist' ? 'Your team reached the final and fell short.' : result === 'playoffs' ? 'Your team made the playoffs.' : 'Your team missed the playoffs.'];
    if (champ) addNews(s, `${champ} win the ${lg.name} championship!`);
    addNews(s, `${team.name} finish ${st.w}-${st.l} under ${s.athletes[s.player.athleteId].lastName}.`);
    if (fired) messages.push('The front office has seen enough. You are let go.');
    return { season: row, champion: champ, mvp, messages };
  });
}

/** Players on the coached team whom the staff can still grow. */
function developRoster(s: GameState, rng: RNG) {
  const c = s.coaching;
  const roster = teamRoster(s, c.teamId);
  const probs = { win_now: { focus: 0.2, extra: 0 }, balanced: { focus: 0.5, extra: 0.1 }, develop: { focus: 0.85, extra: 0.45 } }[c.philosophy];
  for (const a of roster) {
    if (a.age > 25) continue;
    const bump = (k: RatingKey) => {
      const cap = Math.min(99, a.potential + 6);
      if (a.ratings[k] < cap) a.ratings[k]++;
    };
    if (rng.chance(probs.focus)) bump(c.focus);
    if (rng.chance(probs.extra)) bump(rng.pick(RATING_KEYS as unknown as RatingKey[]));
  }
}

/** The offseason: everyone ages, rosters turn over and a new season is set. Returns false if there is nothing to do. */
function rollLeague(s: GameState, rng: RNG, develop: boolean) {
  archiveSeasonStats(s);
  if (develop) {
    ageEveryone(s);
    developNpcs(s, rng);
    if (s.coaching.teamId) developRoster(s, rng);
  }
  leagueOffseasonMoves(s, rng);
  turnoverRosters(s, rng);
  s.career.season++;
  s.career.calendarYear++;
  s.career.week = 0;
  s.leagueStats = {};
  s.lastBox = null;
  s.league = createLeague(rng, s.career.level, s.league.teamIds);
}

/** After the review: the turn of the season, or a new job board if the team let the coach go. */
export function nextSeason(s: GameState): boolean {
  const c = s.coaching;
  if (!c.active || c.stage !== 'review') return false;
  const last = c.history[c.history.length - 1];
  withRng(s, (rng) => rollLeague(s, rng, true));
  if (last?.fired) {
    c.rep = Math.max(c.rep, FIRED_REP_FLOOR);
    c.stage = 'offers';
    c.teamId = '';
    c.offers = coachingOffers(s);
  } else c.stage = 'offseason';
  return true;
}

export interface CoachingSummary {
  seasons: number;
  w: number;
  l: number;
  titles: number;
  finals: number;
  playoffs: number;
  jobs: number;
  /** One number for the coaching career, in the same spirit as the Hall of Fame score. */
  score: number;
}

export function coachingSummary(s: GameState): CoachingSummary {
  const h = s.coaching.history;
  const titles = h.filter((x) => x.result === 'champion').length;
  const finals = h.filter((x) => x.result === 'finalist').length;
  const playoffs = h.filter((x) => x.result !== 'missed').length;
  const w = h.reduce((n, x) => n + x.w, 0);
  const l = h.reduce((n, x) => n + x.l, 0);
  return { seasons: h.length, w, l, titles, finals, playoffs, jobs: new Set(h.map((x) => x.teamId)).size, score: Math.round(titles * 25 + finals * 8 + playoffs * 3 + Math.max(0, w - l) / 4) };
}

export interface CoachRosterRow {
  id: string;
  name: string;
  age: number;
  position: string;
  ovr: number;
  potential: number;
}

export function coachRoster(s: GameState): CoachRosterRow[] {
  if (!s.coaching.teamId) return [];
  return teamRoster(s, s.coaching.teamId)
    .map((a: Athlete) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`, age: a.age, position: a.position, ovr: overall(a.ratings), potential: a.potential }))
    .sort((a, b) => b.ovr - a.ovr);
}

export const standingsOf = (s: GameState): string[] => sortedStandings(s.league);
