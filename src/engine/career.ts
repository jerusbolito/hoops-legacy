import { COLLEGE_TEAMS, LEVEL_CONFIG, PRO_TEAMS, TEAMS_BY_LEVEL, type TeamTemplate } from '../data/teams';
import type {
  Archetype,
  Athlete,
  GameLogEntry,
  GameState,
  Level,
  Npc,
  Position,
  RatingKey,
  ScheduledGame,
  Team,
} from '../state/schemas';
import { SAVE_VERSION } from '../state/schemas';
import { GameSim, type MomentResult } from './gameSim';
import { generateAthlete, generateLeagueTeams, generateTeam, makeNpc } from './generate';
import { NameBook } from './nameBook';
import {
  accumulateLeagueStats,
  advancePlayoffs,
  createLeague,
  currentPlayoffRound,
  playoffRoundName,
  recordResult,
  seedPlayoffs,
  simInput,
  simOptions,
  simOtherGames,
  sortedStandings,
  teamRoster,
  userGameForWeek,
} from './league';
import { developNpcs, offseasonDevelopment, postGameWear, train, weeklyRecovery, type TrainingFocus, type TrainingResult } from './progression';
import { makeRatings, overall } from './ratings';
import { RNG, clamp } from './rng';
import { averages, gameScore, seasonAverages, totals } from './stats';

/* ───────────────────────── RNG plumbing ───────────────────────── */

export function withRng<T>(state: GameState, fn: (rng: RNG) => T): T {
  const rng = new RNG(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

export function addNews(state: GameState, text: string) {
  state.news.push({ season: state.career.season, week: state.career.week, text });
  if (state.news.length > 120) state.news.splice(0, state.news.length - 120);
}

/* ───────────────────────── Career creation ───────────────────────── */

export interface NewCareerInput {
  firstName: string;
  lastName: string;
  hometown: string;
  archetype: Archetype;
  position: Position;
  heightIn: number;
  schoolIndex: number;
  traits: string[];
  seed?: number;
}

export const TRAITS: { id: string; label: string; desc: string }[] = [
  { id: 'clutch', label: 'Clutch Gene', desc: '+5% odds on clutch key moments.' },
  { id: 'gym_rat', label: 'Gym Rat', desc: 'Training is 15% more effective.' },
  { id: 'leader', label: 'Natural Leader', desc: 'Teammates warm up to you faster.' },
  { id: 'hothead', label: 'Hothead', desc: 'Passion runs hot — drama follows.' },
  { id: 'scholar', label: 'Scholar', desc: 'Starts with a higher GPA; studying is easier.' },
  { id: 'showman', label: 'Showman', desc: 'Followers grow faster; the media loves you.' },
];

export function createCareer(input: NewCareerInput): GameState {
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = new RNG(seed);
  const level: Level = 'hs';
  const firstName = input.firstName.trim() || 'Rookie';
  const lastName = input.lastName.trim() || 'Player';
  const names = new NameBook();
  names.reserve(firstName, lastName); // nobody else in the league gets the player's name or surname
  const { teams, athletes } = generateLeagueTeams(rng, level, names);
  const team = teams[clamp(input.schoolIndex, 0, teams.length - 1)];

  const user: Athlete = {
    id: rng.id('ath'),
    firstName,
    lastName,
    position: input.position,
    archetype: input.archetype,
    heightIn: input.heightIn,
    age: 14,
    ratings: makeRatings(rng, 40, 1.5, input.archetype),
    potential: rng.int(88, 95),
    teamId: team.id,
    persistent: true,
  };

  // replace the weakest same-position player so roster size stays fixed
  const roster = athletes.filter((a) => a.teamId === team.id);
  const samePos = roster.filter((a) => a.position === input.position).sort((a, b) => overall(a.ratings) - overall(b.ratings));
  const cut = samePos[0] ?? roster.sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];
  const allAthletes = athletes.filter((a) => a.id !== cut.id);
  team.rosterIds = team.rosterIds.filter((id) => id !== cut.id).concat(user.id);
  allAthletes.push(user);

  const state: GameState = {
    version: SAVE_VERSION,
    id: rng.id('save'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rngState: 0,
    player: {
      athleteId: user.id,
      hometown: input.hometown,
      traits: input.traits.slice(0, 2),
      morale: 65,
      energy: 85,
      academics: input.traits.includes('scholar') ? 3.6 : 3.0,
      money: 0,
      reputation: 5,
      followers: input.traits.includes('showman') ? 800 : 150,
      injury: null,
      progress: {},
      contract: null,
      awards: [],
      draftPick: null,
      collegeId: null,
    },
    athletes: Object.fromEntries(allAthletes.map((a) => [a.id, a])),
    npcs: {},
    teams: Object.fromEntries(teams.map((t) => [t.id, t])),
    league: createLeague(rng, level, teams.map((t) => t.id)),
    career: {
      level,
      year: 1,
      season: 1,
      phase: 'preseason',
      week: 0,
      step: 'scene',
      teamId: team.id,
      calendarYear: new Date().getFullYear(),
    },
    gameLog: [],
    leagueStats: {},
    lastBox: null,
    story: { log: [], seasonSummaries: [], flags: {}, arcs: [], careerSummary: '', defining: [], threads: [] },
    news: [],
    effectLog: [],
  };

  seedHighSchoolCast(state, rng, team, teams);
  state.rngState = rng.state;
  addNews(state, `${user.firstName} ${user.lastName} joins ${team.name} as a freshman.`);
  return state;
}

function addNpc(state: GameState, npc: Npc): Npc {
  state.npcs[npc.id] = npc;
  return npc;
}

function seedHighSchoolCast(state: GameState, rng: RNG, team: Team, teams: Team[]) {
  const season = state.career.season;
  const user = state.athletes[state.player.athleteId];
  const roster = teamRoster(state, team.id).filter((a) => a.id !== user.id);

  addNpc(state, makeNpc(rng, { name: team.coachName, role: 'coach', title: `Head coach, ${team.name}`, season, rel: { respect: 35, trust: 25 } }));

  // Best friend: a teammate at a different position, same age-ish
  const friendAth = roster.find((a) => a.position !== user.position && a.age <= 15) ?? roster.find((a) => a.position !== user.position)!;
  friendAth.age = Math.min(friendAth.age, 15);
  friendAth.persistent = true;
  addNpc(
    state,
    makeNpc(rng, {
      name: `${friendAth.firstName} ${friendAth.lastName}`,
      role: 'friend',
      title: `Teammate & best friend since middle school`,
      season,
      athleteId: friendAth.id,
      rel: { affinity: 45, trust: 55, respect: 40 },
      memories: ['Grew up hooping together at the neighborhood park.'],
    }),
  );

  // Teammate competing for minutes: same position, older and better
  const competitor = roster
    .filter((a) => a.position === user.position && a.id !== friendAth.id)
    .sort((a, b) => overall(b.ratings) - overall(a.ratings))[0];
  if (competitor) {
    competitor.age = Math.max(competitor.age, 17);
    addNpc(
      state,
      makeNpc(rng, {
        name: `${competitor.firstName} ${competitor.lastName}`,
        role: 'teammate',
        title: `Senior starter at your position`,
        season,
        athleteId: competitor.id,
        rel: { affinity: -10, rivalry: 25, respect: 30 },
      }),
    );
  }

  // Cross-town rival: the best young player on a top program, made a little special
  const rivalTeam = [...teams].filter((t) => t.id !== team.id).sort((a, b) => b.prestige - a.prestige)[rng.int(0, 1)];
  const rivalAth = teamRoster(state, rivalTeam.id).sort((a, b) => overall(b.ratings) - overall(a.ratings))[1];
  rivalAth.age = 14;
  rivalAth.persistent = true;
  rivalAth.potential = rng.int(88, 94);
  rivalAth.ratings = makeRatings(rng, 42, 1.5, rivalAth.archetype);
  addNpc(
    state,
    makeNpc(rng, {
      name: `${rivalAth.firstName} ${rivalAth.lastName}`,
      role: 'rival',
      title: `Freshman phenom at ${rivalTeam.name}`,
      season,
      athleteId: rivalAth.id,
      personality: ['cocky', rng.pick(['intense', 'flashy', 'calculating'])],
      rel: { affinity: -15, rivalry: 45, respect: 35 },
      memories: ['Beat you in an AAU tournament final last summer and let you hear about it.'],
    }),
  );

  const names = NameBook.fromState(state);
  // a parent shares the player's surname; only the first name is drawn (and kept unique among full names)
  let parentFirst = names.firstName(rng);
  while (names.isTaken(parentFirst, user.lastName)) parentFirst = names.firstName(rng);
  names.reserve(parentFirst, user.lastName);
  addNpc(
    state,
    makeNpc(rng, {
      name: `${parentFirst} ${user.lastName}`,
      role: 'family',
      title: 'Your parent, who drives you to every practice',
      season,
      personality: ['protective', rng.pick(['wise', 'stubborn', 'warm'])],
      rel: { affinity: 70, trust: 70, respect: 50 },
    }),
  );

  const crush = names.draw(rng, { gender: 'f' });
  addNpc(
    state,
    makeNpc(rng, {
      name: crush.full,
      role: 'love_interest',
      title: 'Classmate in your English class',
      season,
      rel: { affinity: 10, trust: 20, respect: 20, romance: 5 },
    }),
  );
}

/* ───────────────────────── Roles & helpers ───────────────────────── */

export function userAthlete(state: GameState): Athlete {
  return state.athletes[state.player.athleteId];
}

export function userTeam(state: GameState): Team {
  return state.teams[state.career.teamId];
}

export function userRole(state: GameState): { rank: number; label: string } {
  const roster = teamRoster(state, state.career.teamId).sort((a, b) => overall(b.ratings) - overall(a.ratings));
  const rank = roster.findIndex((a) => a.id === state.player.athleteId) + 1;
  const label = rank === 1 ? 'Franchise Star' : rank <= 3 ? 'Starter (go-to option)' : rank <= 5 ? 'Starter' : rank <= 8 ? 'Rotation' : 'Deep Bench';
  return { rank, label };
}

/* ───────────────────────── Weekly flow ───────────────────────── */

export function doTraining(state: GameState, focus: TrainingFocus): TrainingResult {
  return withRng(state, (rng) => {
    const intensity = state.player.traits.includes('gym_rat') ? 1.15 : 1;
    const r = train(state, rng, focus, state.player.traits.includes('scholar') && focus === 'study' ? 1.3 : intensity);
    state.career.step = 'scene';
    return r;
  });
}

export function doSummerTraining(state: GameState, focuses: RatingKey[]) {
  return withRng(state, (rng) => {
    const gains = offseasonDevelopment(state, rng, focuses);
    state.career.step = 'scene';
    return gains;
  });
}

export function completeScene(state: GameState) {
  const { phase, week } = state.career;
  if ((phase === 'regular' || phase === 'playoffs') && userGameForWeek(state, week)) state.career.step = 'game';
  else state.career.step = 'done';
}

export function createUserGameSim(state: GameState): { sim: GameSim; game: ScheduledGame } | null {
  const game = userGameForWeek(state, state.career.week);
  if (!game) return null;
  const rng = new RNG(state.rngState);
  const sim = new GameSim(rng, simInput(state, state.teams[game.homeId]), simInput(state, state.teams[game.awayId]), simOptions(state, true));
  return { sim, game };
}

export interface GameReport {
  gameId: string;
  won: boolean;
  teamScore: number;
  oppScore: number;
  oppId: string;
  line: GameLogEntry['line'] | null;
  injury: string | null;
  moments: MomentResult[];
  playoffRound?: number;
  roundName?: string;
  gameScore: number;
}

/**
 * Commit a finished user game. `sim` must have been created from the current
 * state via createUserGameSim; its RNG state becomes the new state RNG.
 */
export function finishUserGame(state: GameState, sim: GameSim, game: ScheduledGame): GameReport {
  const box = sim.boxScore();
  state.rngState = sim.rng.state;
  const g = state.league.schedule.find((x) => x.id === game.id)!;
  recordResult(state.league, g, box);
  accumulateLeagueStats(state, box);

  const us = state.career.teamId;
  const isHome = g.homeId === us;
  const ourBox = isHome ? box.home : box.away;
  const theirBox = isHome ? box.away : box.home;
  const line = ourBox.players.find((p) => p.athleteId === state.player.athleteId) ?? null;
  const won = ourBox.score > theirBox.score;

  if (line) {
    state.gameLog.push({
      gameId: g.id,
      season: state.career.season,
      level: state.career.level,
      year: state.career.year,
      week: state.career.week,
      teamId: us,
      oppId: theirBox.teamId,
      teamScore: ourBox.score,
      oppScore: theirBox.score,
      playoff: !!g.playoffRound,
      line,
    });
  }
  state.lastBox = { gameId: g.id, box };

  const report = withRng(state, (rng) => {
    const totalSec = LEVEL_CONFIG[state.career.level].quarterMinutes * 60 * 4;
    const injury = line ? postGameWear(state, rng, line.sec, totalSec) : null;
    // sim the rest of the league this week
    simOtherGames(state, rng, state.career.week, us, !!g.playoffRound);
    return injury;
  });

  // morale / reputation from the result (engine-side, deterministic)
  const gs = line ? gameScore(line) : 0;
  const p = state.player;
  p.morale = clamp(p.morale + (won ? 4 : -4) + (gs > 18 ? 3 : gs < 4 && line && line.sec > 600 ? -3 : 0), 0, 100);
  p.reputation = clamp(p.reputation + (gs > 22 ? 2 : gs > 15 ? 1 : 0) + (won && g.playoffRound ? 1 : 0), 0, 100);
  const followerGain = Math.round((gs > 0 ? gs : 0) * (p.traits.includes('showman') ? 12 : 6) * (1 + p.reputation / 25));
  p.followers += followerGain;

  const opp = state.teams[theirBox.teamId];
  if (line && gs > 22) addNews(state, `${userAthlete(state).lastName} erupts vs ${opp.name}: ${line.pts} pts, ${line.orb + line.drb} reb, ${line.ast} ast.`);
  if (report) addNews(state, `${userAthlete(state).lastName} suffered a ${report} and will miss time.`);

  // rivalry bookkeeping
  for (const n of Object.values(state.npcs)) {
    if (n.athleteId && theirBox.players.some((l) => l.athleteId === n.athleteId && l.sec > 0)) {
      const theirLine = theirBox.players.find((l) => l.athleteId === n.athleteId)!;
      if (n.role === 'rival') {
        n.relationship.rivalry = clamp(n.relationship.rivalry + 4, 0, 100);
        n.memories.push(`${won ? 'You beat' : 'Lost to'} them ${ourBox.score}-${theirBox.score}; you had ${line?.pts ?? 0}, they had ${theirLine.pts}.`);
        if (n.memories.length > 8) n.memories.shift();
      }
    }
  }

  // playoffs bookkeeping
  let roundName: string | undefined;
  if (g.playoffRound) {
    roundName = playoffRoundName(state.league, g.playoffRound);
    withRng(state, (rng) => advancePlayoffs(state.league, rng));
  }

  state.career.step = 'done';
  return {
    gameId: g.id,
    won,
    teamScore: ourBox.score,
    oppScore: theirBox.score,
    oppId: theirBox.teamId,
    line,
    injury: report,
    moments: sim.momentResults,
    playoffRound: g.playoffRound,
    roundName,
    gameScore: gs,
  };
}

export interface WeekAdvance {
  seasonEnded: boolean;
  messages: string[];
}

/** Move the calendar forward after the current week's steps are done. */
export function advanceWeek(state: GameState): WeekAdvance {
  const c = state.career;
  const messages: string[] = [];
  weeklyRecovery(state);

  return withRng(state, (rng) => {
    if (c.phase === 'preseason') {
      c.phase = 'regular';
      c.week = 1;
      c.step = 'training';
      return { seasonEnded: false, messages };
    }

    if (c.phase === 'regular') {
      // make sure every game of this week is played (e.g., user was injured/bye)
      simOtherGames(state, rng, c.week, '__none__');
      if (c.week < state.league.regularWeeks) {
        c.week++;
        c.step = 'training';
        return { seasonEnded: false, messages };
      }
      seedPlayoffs(state.league, rng);
      c.phase = 'playoffs';
      c.week++;
      const inPlayoffs = !!userGameForWeek(state, c.week);
      messages.push(inPlayoffs ? 'Playoffs! Your team made the bracket.' : 'Your team missed the playoffs.');
      addNews(state, inPlayoffs ? `${userTeam(state).name} clinches a playoff spot.` : `${userTeam(state).name} misses the playoffs.`);
      if (!inPlayoffs) return finishPlayoffsAndSeason(state, rng, messages);
      c.step = 'training';
      return { seasonEnded: false, messages };
    }

    if (c.phase === 'playoffs') {
      // finish any non-user games in this round, then advance bracket
      simOtherGames(state, rng, c.week, '__none__', true);
      const champ = advancePlayoffs(state.league, rng);
      if (champ) return finishPlayoffsAndSeason(state, rng, messages);
      c.week++;
      if (!userGameForWeek(state, c.week)) return finishPlayoffsAndSeason(state, rng, messages);
      c.step = 'training';
      return { seasonEnded: false, messages };
    }

    if (c.phase === 'offseason') {
      return startNextSeason(state, rng, messages);
    }

    return { seasonEnded: false, messages };
  });
}

function finishPlayoffsAndSeason(state: GameState, rng: RNG, messages: string[]): WeekAdvance {
  const league = state.league;
  // sim remaining bracket
  let guard = 0;
  while (!league.champion && guard++ < 10) {
    const round = currentPlayoffRound(league);
    const week = league.schedule.find((g) => g.playoffRound === round)?.week ?? state.career.week;
    simOtherGames(state, rng, week, '__none__', true);
    advancePlayoffs(league, rng);
  }
  const champ = league.champion ? state.teams[league.champion] : null;
  if (champ) {
    addNews(state, `${champ.name} win the ${league.name} championship!`);
    messages.push(champ.id === state.career.teamId ? 'CHAMPIONS! You won the title!' : `${champ.name} won the championship.`);
  }
  computeAwards(state, messages);
  state.career.phase = 'offseason';
  state.career.week = 0;
  state.career.step = 'training';
  return { seasonEnded: true, messages };
}

/* ───────────────────────── Awards ───────────────────────── */

function computeAwards(state: GameState, messages: string[]) {
  const season = state.career.season;
  const level = state.career.level;
  const league = state.league;
  const ids = league.teamIds.flatMap((t) => state.teams[t].rosterIds);
  const winPct = (teamId: string | null) => {
    if (!teamId) return 0.5;
    const s = league.standings[teamId];
    return s ? s.w / Math.max(1, s.w + s.l) : 0.5;
  };
  const scored = ids
    .map((id) => {
      const s = state.leagueStats[id];
      const a = state.athletes[id];
      if (!s || !a || s.gp < Math.max(3, league.regularWeeks * 0.5)) return null;
      const per = (s.pts + s.reb * 0.6 + s.ast * 0.8 + s.stl * 1.2 + s.blk * 1.2) / s.gp;
      const def = (s.stl + s.blk) / s.gp + a.ratings.defense / 40;
      return { id, per: per * (0.75 + winPct(a.teamId) * 0.5), def };
    })
    .filter((x): x is { id: string; per: number; def: number } => !!x)
    .sort((a, b) => b.per - a.per);

  const uid = state.player.athleteId;
  const give = (name: string) => {
    state.player.awards.push({ season, level, name });
    messages.push(`Award: ${name}`);
    addNews(state, `${userAthlete(state).lastName} named ${name}.`);
  };
  const leagueName = level === 'pro' ? 'League' : 'Conference';
  if (scored[0]?.id === uid) give(`${leagueName} MVP`);
  else if (scored[0]) addNews(state, `${state.athletes[scored[0].id].firstName} ${state.athletes[scored[0].id].lastName} wins ${leagueName} MVP.`);
  if (scored.slice(0, 5).some((s) => s.id === uid)) give(`All-${leagueName} First Team`);
  else if (scored.slice(5, 10).some((s) => s.id === uid)) give(`All-${leagueName} Second Team`);
  const dpoy = [...scored].sort((a, b) => b.def - a.def)[0];
  if (dpoy?.id === uid) give('Defensive Player of the Year');
  if (league.champion === state.career.teamId) give(`${league.name} Champion`);
}

/* ───────────────────────── Season transitions ───────────────────────── */

function graduationAge(level: Level): number {
  return level === 'hs' ? 18 : level === 'college' ? 22 : 36;
}

/**
 * When a player leaves the roster for good (graduation, early entry, retirement), the story
 * character built on top of them must leave too, so the narrator stops treating them as a teammate.
 */
function retireNpcForAthlete(state: GameState, a: Athlete, level: Level) {
  for (const n of Object.values(state.npcs)) {
    if (n.athleteId !== a.id || !n.active) continue;
    const reason =
      level === 'hs' ? 'Graduated' : level === 'college' ? (a.age >= graduationAge(level) ? 'Graduated' : 'Left school early') : 'Retired';
    n.active = false;
    n.athleteId = undefined;
    n.title = `Former teammate (${reason.toLowerCase()} after season ${state.career.season})`;
    n.memories.push(`${reason} after season ${state.career.season}; no longer on your team.`);
    addNews(state, `${n.name} ${reason === 'Retired' ? 'has retired' : reason === 'Graduated' ? 'has graduated' : 'has left the program'} — no longer on the roster.`);
  }
}

/**
 * Safety net (also covers older saves): any teammate/rival whose athlete no longer exists or has no
 * team is not part of the current story cast.
 */
export function retireStaleNpcs(state: GameState) {
  for (const n of Object.values(state.npcs)) {
    if (!n.active || !n.athleteId) continue;
    if (n.role !== 'teammate' && n.role !== 'friend') continue;
    const a = state.athletes[n.athleteId];
    if (!a) {
      n.active = false;
      n.athleteId = undefined;
      n.title = `Former teammate (moved on)`;
    }
  }
}

/** Remove departing NPC athletes and refill rosters with newcomers. */
function turnoverRosters(state: GameState, rng: RNG) {
  const names = NameBook.fromState(state);
  const level = state.career.level;
  const cfg = LEVEL_CONFIG[level];
  for (const teamId of state.league.teamIds) {
    const team = state.teams[teamId];
    const keep: string[] = [];
    for (const id of team.rosterIds) {
      const a = state.athletes[id];
      if (!a) continue;
      if (a.id === state.player.athleteId) {
        keep.push(id);
        continue;
      }
      const ovr = overall(a.ratings);
      const leaves =
        a.age >= graduationAge(level) ||
        (level === 'college' && ovr >= 72 && rng.chance(0.6)) ||
        (level === 'pro' && a.age >= 32 && ovr < 68 && rng.chance(0.6));
      if (leaves) {
        a.teamId = null;
        if (!a.persistent) {
          retireNpcForAthlete(state, a, level);
          delete state.athletes[id];
        }
      } else keep.push(id);
    }
    team.rosterIds = keep;
    const youngAge = level === 'hs' ? 14 : level === 'college' ? 18 : rng.int(20, 22);
    const newMean = cfg.ratingMean - (level === 'pro' ? 4 : 7) + (team.prestige - 60) / 8;
    while (team.rosterIds.length < cfg.rosterSize) {
      const a = generateAthlete(rng, level, { mean: newMean, teamId, age: youngAge, names });
      state.athletes[a.id] = a;
      team.rosterIds.push(a.id);
    }
  }
}

function newSeasonCommon(state: GameState, rng: RNG) {
  state.career.season++;
  state.career.calendarYear++;
  state.career.phase = 'preseason';
  state.career.week = 0;
  state.career.step = 'scene';
  state.leagueStats = {};
  state.lastBox = null;
  state.league = createLeague(rng, state.career.level, state.league.teamIds);
  state.player.energy = clamp(state.player.energy + 30, 0, 100);
}

function ageEveryone(state: GameState) {
  for (const a of Object.values(state.athletes)) a.age++;
}

function startNextSeason(state: GameState, rng: RNG, messages: string[]): WeekAdvance {
  const c = state.career;
  ageEveryone(state);
  developNpcs(state, rng);
  const nextYear = c.year + 1;

  if (c.level === 'hs' && nextYear > 4) {
    c.phase = 'recruiting';
    c.step = 'scene';
    messages.push('Your high school career is over. Time to pick a college.');
    return { seasonEnded: false, messages };
  }
  if (c.level === 'college' && (nextYear > 4 || state.story.flags.declared_for_draft === true)) {
    c.phase = 'draft';
    c.step = 'scene';
    messages.push('Draft night is here.');
    return { seasonEnded: false, messages };
  }
  if (c.level === 'pro') {
    if (state.story.flags.retiring === true) {
      c.phase = 'retired';
      c.step = 'done';
      messages.push('You have retired. What a career.');
      return { seasonEnded: false, messages };
    }
    const k = state.player.contract;
    if (k) {
      k.yearsLeft--;
      state.player.money += k.salary;
      if (k.yearsLeft <= 0) {
        c.phase = 'free_agency';
        c.step = 'scene';
        messages.push('Your contract is up. You are a free agent.');
        return { seasonEnded: false, messages };
      }
    }
  }

  c.year = nextYear;
  turnoverRosters(state, rng);
  retireStaleNpcs(state);
  promoteTeammate(state, rng);
  newSeasonCommon(state, rng);
  if (c.level === 'hs' && c.year === 3) introduceScout(state, rng);
  messages.push(`Season ${c.season} begins.`);
  return { seasonEnded: false, messages };
}

/** If the last teammate character left, the team's best remaining veteran steps into that role. */
function promoteTeammate(state: GameState, rng: RNG) {
  const hasTeammate = Object.values(state.npcs).some((n) => n.active && n.role === 'teammate' && n.athleteId && state.athletes[n.athleteId]?.teamId === state.career.teamId);
  if (hasTeammate) return;
  const level = state.career.level;
  const mate = teamRoster(state, state.career.teamId)
    .filter((a) => a.id !== state.player.athleteId && !a.persistent && !Object.values(state.npcs).some((n) => n.athleteId === a.id))
    .sort((a, b) => b.age - a.age || overall(b.ratings) - overall(a.ratings))[0];
  if (!mate) return;
  const sameSpot = mate.position === userAthlete(state).position;
  addNpc(
    state,
    makeNpc(rng, {
      name: `${mate.firstName} ${mate.lastName}`,
      role: 'teammate',
      title: level === 'pro' ? `Veteran teammate at ${userTeam(state).name}` : `${sameSpot ? 'Upperclassman competing for your minutes' : 'Upperclassman leader'} at ${userTeam(state).name}`,
      season: state.career.season + 1,
      athleteId: mate.id,
      rel: { affinity: 0, respect: 25, trust: 15, rivalry: sameSpot ? 10 : 0 },
    }),
  );
}

function introduceScout(state: GameState, rng: RNG) {
  const n = NameBook.fromState(state).draw(rng, { gender: 'any' });
  addNpc(
    state,
    makeNpc(rng, {
      name: n.full,
      role: 'scout',
      title: 'College recruiting coordinator who has been at your games',
      season: state.career.season,
      rel: { respect: 30, trust: 20 },
    }),
  );
}

/** Move the user (and persistent NPC athletes) into a fresh league at a new level. */
function enterLevel(state: GameState, rng: RNG, level: Level, tpl: TeamTemplate) {
  // detach old league
  for (const tid of state.league.teamIds) state.teams[tid].rosterIds = [];
  for (const a of Object.values(state.athletes)) {
    if (!a.persistent) delete state.athletes[a.id];
    else a.teamId = null;
  }
  const others = TEAMS_BY_LEVEL[level].filter((t) => t.name !== tpl.name);
  const names = NameBook.fromState(state); // after clearing old non-persistent athletes
  const { teams, athletes } = generateLeagueTeams(rng, level, names);
  for (const a of athletes) state.athletes[a.id] = a;
  for (const t of teams) state.teams[t.id] = t;
  const team = teams.find((t) => t.name === tpl.name)!;
  void others;

  const placeInto = (ath: Athlete, t: Team) => {
    const roster = t.rosterIds.map((id) => state.athletes[id]);
    const cut = roster.filter((a) => !a.persistent && a.position === ath.position).sort((a, b) => overall(a.ratings) - overall(b.ratings))[0] ??
      roster.filter((a) => !a.persistent).sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];
    if (cut) {
      t.rosterIds = t.rosterIds.filter((id) => id !== cut.id);
      delete state.athletes[cut.id];
    }
    t.rosterIds.push(ath.id);
    ath.teamId = t.id;
  };

  placeInto(userAthlete(state), team);
  // persistent NPC athletes follow the user up the ladder
  const persistentNpcs = Object.values(state.npcs).filter((n) => n.athleteId && state.athletes[n.athleteId]?.persistent && n.active);
  for (const n of persistentNpcs) {
    const ath = state.athletes[n.athleteId!];
    if (ath.id === state.player.athleteId) continue;
    const ovr = overall(ath.ratings);
    const minOvr = LEVEL_CONFIG[level].ratingMean - 10;
    if (ovr < minOvr) {
      // didn't make it — they stay in the story but off the court
      ath.persistent = false;
      delete state.athletes[ath.id];
      n.athleteId = undefined;
      n.title = `${n.title.split(',')[0]}, no longer playing`;
      continue;
    }
    let target: Team;
    if (n.role === 'rival') {
      target = [...teams].filter((t) => t.id !== team.id).sort((a, b) => b.prestige - a.prestige)[rng.int(0, 2)];
    } else if (n.role === 'friend' && n.relationship.affinity > 50 && rng.chance(0.5)) {
      target = team;
    } else {
      target = rng.pick(teams.filter((t) => t.id !== team.id));
    }
    placeInto(ath, target);
    n.title = `${n.role === 'rival' ? 'Rival' : n.role === 'friend' ? 'Old friend' : 'Former teammate'}, now at ${target.name}`;
  }

  // retire old-level role NPCs that can't follow (old coach stays as mentor-ish)
  for (const n of Object.values(state.npcs)) {
    if (n.role === 'coach') {
      n.role = 'mentor';
      n.title = `Your former coach`;
    }
    if (n.role === 'teammate' && !n.athleteId) n.active = false;
    if (n.role === 'teammate' && n.athleteId && !state.athletes[n.athleteId]) {
      n.active = false;
      n.athleteId = undefined;
    }
  }

  state.career.level = level;
  state.career.year = 1;
  state.career.teamId = team.id;
  state.league = createLeague(rng, level, teams.map((t) => t.id));

  addNpc(state, makeNpc(rng, { name: team.coachName, role: 'coach', title: `Head coach, ${team.name}`, season: state.career.season + 1, rel: { respect: 30, trust: 25 } }));
  const mate = teamRoster(state, team.id).filter((a) => a.id !== state.player.athleteId && !a.persistent).sort((a, b) => overall(b.ratings) - overall(a.ratings))[0];
  if (mate) {
    addNpc(
      state,
      makeNpc(rng, {
        name: `${mate.firstName} ${mate.lastName}`,
        role: 'teammate',
        title: level === 'pro' ? `Veteran leader of ${team.name}` : `Upperclassman captain at ${team.name}`,
        season: state.career.season + 1,
        athleteId: mate.id,
        rel: { affinity: 0, respect: 25, trust: 15 },
      }),
    );
  }
  if (level === 'college') {
    const r = NameBook.fromState(state).draw(rng, { gender: 'f' });
    addNpc(state, makeNpc(rng, { name: r.full, role: 'media', title: 'Campus beat reporter', season: state.career.season + 1 }));
  }
}

/* ───────────────────────── Recruiting ───────────────────────── */

export interface CollegeOffer {
  name: string;
  mascot: string;
  prestige: number;
  colors: [string, string];
  pitch: string;
  playingTime: string;
}

export function recruitingStars(state: GameState): number {
  const ovr = overall(userAthlete(state).ratings);
  const avg = seasonAverages(state.gameLog, state.career.season);
  const score = ovr + avg.ppg * 0.4 + state.player.reputation * 0.1;
  return score >= 74 ? 5 : score >= 68 ? 4 : score >= 61 ? 3 : score >= 54 ? 2 : 1;
}

export function recruitingOffers(state: GameState): CollegeOffer[] {
  const stars = recruitingStars(state);
  const maxPrestige = [0, 55, 66, 78, 88, 100][stars];
  const gpaOk = state.player.academics >= 2.3;
  return withRng(state, (rng) => {
    const pool = COLLEGE_TEAMS.filter((t) => t.prestige <= maxPrestige + 2 && (gpaOk || t.prestige < 60));
    const sorted = [...pool].sort((a, b) => b.prestige - a.prestige);
    const picks = sorted.slice(0, 2).concat(rng.shuffle(sorted.slice(2)).slice(0, 2));
    const guaranteed = picks.length ? picks : COLLEGE_TEAMS.filter((t) => t.prestige < 55);
    return guaranteed.map((t) => ({
      name: t.name,
      mascot: t.mascot,
      prestige: t.prestige,
      colors: t.colors,
      pitch: t.prestige >= 85 ? 'Blue-blood program. Title or bust, national TV every week.' : t.prestige >= 70 ? 'Rising power that wants to build around you.' : 'You would be the face of the program from day one.',
      playingTime: t.prestige - stars * 12 >= 40 ? 'Earn your minutes' : t.prestige - stars * 12 >= 20 ? 'Rotation from day one' : 'Starter from day one',
    }));
  });
}

export function commitToCollege(state: GameState, collegeName: string) {
  const tpl = COLLEGE_TEAMS.find((t) => t.name === collegeName);
  if (!tpl) throw new Error(`Unknown college ${collegeName}`);
  withRng(state, (rng) => {
    enterLevel(state, rng, 'college', tpl);
    state.player.collegeId = state.career.teamId;
    newSeasonCommon(state, rng);
  });
  addNews(state, `${userAthlete(state).lastName} commits to ${tpl.name}!`);
}

/* ───────────────────────── Draft ───────────────────────── */

export function draftStock(state: GameState): number {
  const a = userAthlete(state);
  const ovr = overall(a.ratings);
  const avg = averages(totals(state.gameLog.filter((e) => e.season === state.career.season - 1 || e.season === state.career.season)));
  const youth = Math.max(0, 22 - a.age) * 1.5;
  return ovr + avg.ppg * 0.25 + youth + (a.potential - ovr) * 0.25 + state.player.reputation * 0.05;
}

export function projectedPick(state: GameState): string {
  const s = draftStock(state);
  if (s >= 80) return 'Projected lottery pick';
  if (s >= 74) return 'Projected first round';
  if (s >= 68) return 'Projected second round';
  return 'Projected undrafted';
}

export interface DraftResult {
  pick: number | null;
  teamName: string;
  salary: number;
  years: number;
}

export function runDraft(state: GameState): DraftResult {
  return withRng(state, (rng) => {
    const stock = draftStock(state) + rng.normal(0, 2.5);
    // pick 1 at stock >= 84, ~0.8 pick per point below
    const raw = Math.round((84 - stock) * 1.4) + 1;
    const pick = raw < 1 ? 1 : raw > 24 ? null : raw;
    // worse teams pick earlier: reverse prestige order
    const order = [...PRO_TEAMS].sort((a, b) => a.prestige - b.prestige);
    const tpl = pick ? order[(pick - 1) % order.length] : rng.pick(PRO_TEAMS);
    const salary = pick ? Math.round((pick <= 12 ? 11_000_000 - (pick - 1) * 700_000 : 2_400_000 - (pick - 13) * 70_000) / 1000) * 1000 : 1_100_000;
    const years = pick && pick <= 12 ? 4 : 2;
    enterLevel(state, rng, 'pro', tpl);
    state.player.draftPick = pick;
    state.player.contract = { teamId: state.career.teamId, salary, yearsLeft: years };
    state.story.flags.declared_for_draft = false;
    const agentName = NameBook.fromState(state).draw(rng, { gender: 'any' });
    addNpc(
      state,
      makeNpc(rng, {
        name: agentName.full,
        role: 'agent',
        title: 'Your agent',
        season: state.career.season + 1,
        personality: ['calculating', 'ambitious'],
        rel: { affinity: 20, trust: 30, respect: 30 },
      }),
    );
    newSeasonCommon(state, rng);
    addNews(state, pick ? `${tpl.name} ${tpl.mascot} select ${userAthlete(state).lastName} with pick #${pick}.` : `${userAthlete(state).lastName} goes undrafted, signs with ${tpl.name}.`);
    return { pick, teamName: `${tpl.name} ${tpl.mascot}`, salary, years };
  });
}

/* ───────────────────────── Free agency ───────────────────────── */

export interface FaOffer {
  teamName: string;
  mascot: string;
  prestige: number;
  colors: [string, string];
  salary: number;
  years: number;
  current: boolean;
}

export function marketValue(state: GameState): number {
  const ovr = overall(userAthlete(state).ratings);
  const v = Math.max(1.1, ((ovr - 62) / 26) ** 2.2 * 45) * 1_000_000;
  return Math.round(v / 100_000) * 100_000;
}

export function freeAgencyOffers(state: GameState): FaOffer[] {
  const value = marketValue(state);
  const age = userAthlete(state).age;
  const currentName = userTeam(state).name;
  return withRng(state, (rng) => {
    const teams = rng.shuffle([...PRO_TEAMS]).slice(0, 3);
    if (!teams.some((t) => t.name === currentName)) teams.unshift(PRO_TEAMS.find((t) => t.name === currentName)!);
    return teams.map((t) => ({
      teamName: t.name,
      mascot: t.mascot,
      prestige: t.prestige,
      colors: t.colors,
      salary: Math.round((value * rng.range(0.85, 1.15) * (t.name === currentName ? 1.05 : 1)) / 100_000) * 100_000,
      years: age >= 32 ? rng.int(1, 2) : rng.int(2, 5),
      current: t.name === currentName,
    }));
  });
}

export function signFreeAgent(state: GameState, offer: FaOffer) {
  withRng(state, (rng) => {
    const c = state.career;
    if (!offer.current) {
      const tpl = PRO_TEAMS.find((t) => t.name === offer.teamName)!;
      const target = Object.values(state.teams).find((t) => t.level === 'pro' && t.name === tpl.name && state.league.teamIds.includes(t.id))!;
      const old = state.teams[c.teamId];
      old.rosterIds = old.rosterIds.filter((id) => id !== state.player.athleteId);
      // swap: cut target's weakest, give old team a replacement
      const weakest = target.rosterIds.map((id) => state.athletes[id]).filter((a) => !a.persistent).sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];
      if (weakest) {
        target.rosterIds = target.rosterIds.filter((id) => id !== weakest.id);
        old.rosterIds.push(weakest.id);
        weakest.teamId = old.id;
      }
      target.rosterIds.push(state.player.athleteId);
      userAthlete(state).teamId = target.id;
      c.teamId = target.id;
      for (const n of Object.values(state.npcs)) {
        if (n.role === 'coach' && n.active) {
          n.role = 'mentor';
          n.title = 'Your former coach';
        }
      }
      addNpc(state, makeNpc(rng, { name: target.coachName, role: 'coach', title: `Head coach, ${target.name}`, season: c.season + 1 }));
    }
    state.player.contract = { teamId: c.teamId, salary: offer.salary, yearsLeft: offer.years };
    c.year++;
    turnoverRosters(state, rng);
    newSeasonCommon(state, rng);
    addNews(state, `${userAthlete(state).lastName} signs ${offer.years}-year, $${(offer.salary / 1e6).toFixed(1)}M/yr deal with ${offer.teamName}.`);
  });
}

/* ───────────────────────── Standings helpers for UI ───────────────────────── */

export function standingsRows(state: GameState) {
  return sortedStandings(state.league).map((id, i) => ({ rank: i + 1, team: state.teams[id], ...state.league.standings[id] }));
}

export function nextOpponent(state: GameState): { game: ScheduledGame; opp: Team; home: boolean } | null {
  const g = userGameForWeek(state, state.career.week);
  if (!g) return null;
  const home = g.homeId === state.career.teamId;
  return { game: g, opp: state.teams[home ? g.awayId : g.homeId], home };
}

export { generateTeam };
