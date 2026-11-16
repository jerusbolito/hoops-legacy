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
import { OriginSchema, SAVE_VERSION, type Origin, type PlanId } from '../state/schemas';
import { applyOriginStart, modsOf } from './origin';
import { checkBadgeUnlocks } from './badges';
import { ensureGoals } from './goals';
import { recordSeasonHonors } from './honors';
import { closeSeasonRecords } from './records';
import { notePeak } from './legacyScore';
import { coachReacts, coachStanding, practiceEffort, type CoachChange } from './coach';
import { AGGRAVATE_CHANCE, MIN_GPA, WEEKLY_GPA_DRIFT, activateDueRipples, canPlayHurt, isPlayingHurt, updateEstrangement } from './consequences';
import { hasService, payWeek, rollFinanceSeason } from './finance';
import { FILM_ENERGY_COST, energySavedBy } from './gameplan';
import { midseasonHeadlines, scoredPlayers } from './awards';
import { draftStock, projectedPick, simulateDraft, type DraftPick } from './draft';
import { archiveSeasonStats } from './leaders';
import { publishIssue } from './paper';
import { chemistryAfterGame, chemistryNewSeason, weeklyChemistry } from './chemistry';
import { capSpace, MIN_SALARY, weeklyHoldout } from './contracts';
import { adoptCoach } from './moves';
import { romanceNewLevel, weeklyRomance } from './romance';
import { rollLifeEvent } from './lifeEvents';
import { recordRivalryGame } from './rivalry';
import { classCommitNews, refreshTargets, suitorOf, tickRecruiting, topSuitor } from './recruiting';
import { leagueInSeasonTrades, leagueOffseasonMoves } from './transactions';
import { addNews, logTransaction } from './news';
import { expireOffers, maybeOffer, maybePress, postGamePosts, settleDeals, systemPost, weeklyDealEnergy } from './media';
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
import { gameScore, seasonAverages } from './stats';
import { developStoryAthletes, promoteTeammate, recordStorySeasons, refreshStoryTitles } from './storyAthletes';

/* ───────────────────────── RNG plumbing ───────────────────────── */

export function withRng<T>(state: GameState, fn: (rng: RNG) => T): T {
  const rng = new RNG(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

export { addNews };

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
  /** Where the player comes from and why they play. Leave out for the classic start with no effects. */
  origin?: Partial<Origin>;
}

export const TRAITS: { id: string; label: string; desc: string }[] = [
  { id: 'clutch', label: 'Clutch Gene', desc: '+5% odds on clutch key moments.' },
  { id: 'gym_rat', label: 'Gym Rat', desc: 'Training is 15% more effective.' },
  { id: 'leader', label: 'Natural Leader', desc: 'Teammates warm up to you faster.' },
  { id: 'hothead', label: 'Hothead', desc: 'Passion runs hot — drama follows.' },
  { id: 'scholar', label: 'Scholar', desc: 'Starts with a higher GPA; studying is easier.' },
  { id: 'showman', label: 'Showman', desc: 'Followers grow faster; the media loves you.' },
];

/** Put an athlete on a roster by cutting the weakest player at the same position, so the roster size stays fixed. */
function seatAthlete(athletes: Athlete[], team: Team, user: Athlete): Athlete[] {
  const roster = athletes.filter((a) => a.teamId === team.id);
  const samePos = roster.filter((a) => a.position === user.position).sort((a, b) => overall(a.ratings) - overall(b.ratings));
  const cut = samePos[0] ?? roster.sort((a, b) => overall(a.ratings) - overall(b.ratings))[0];
  const all = athletes.filter((a) => a.id !== cut.id);
  team.rosterIds = team.rosterIds.filter((id) => id !== cut.id).concat(user.id);
  all.push(user);
  return all;
}

function newPlayer(athleteId: string, hometown: string, traits: string[], o: { season: number; money?: number; reputation?: number; followers?: number; origin?: Partial<Origin> }): GameState['player'] {
  return {
    athleteId,
    hometown,
    traits: traits.slice(0, 2),
    morale: 65,
    energy: 85,
    academics: traits.includes('scholar') ? 3.6 : 3.0,
    money: o.money ?? 0,
    reputation: o.reputation ?? 5,
    followers: (o.followers ?? 150) + (traits.includes('showman') ? 650 : 0),
    injury: null,
    progress: {},
    contract: null,
    awards: [],
    draftPick: null,
    collegeId: null,
    badges: [],
    deals: [],
    injuryHistory: 0,
    clutchWins: 0,
    draftBoost: 0,
    eventsDone: [],
    services: [],
    finance: { season: o.season, earned: 0, endorse: 0, taxes: 0, living: 0, services: 0, spent: 0, gifts: 0, prev: null },
    origin: OriginSchema.parse(o.origin ?? {}),
  };
}

function newCareerState(teamId: string, season: number, calendarYear: number): GameState['career'] {
  return {
    level: 'hs',
    year: 1,
    season,
    phase: 'preseason',
    week: 0,
    step: 'scene',
    teamId,
    calendarYear,
    plan: null,
    playHurt: false,
    press: null,
    gamesSincePress: 0,
    lifeEvent: null,
    recentLife: [],
    weeksSinceLife: 0,
    moveSeason: 0,
    pendingMove: null,
    chemistry: 55,
  };
}

export interface GenerationSetup {
  /** Index into the new high school league's teams. */
  schoolIndex: number;
  hometown: string;
  traits: string[];
  money: number;
  reputation: number;
  followers: number;
  /** Calendar years that pass between the last career and this one. */
  yearsLater: number;
  origin: Origin;
}

/**
 * Starts the next player in the same save: a fresh high school league, a fresh cast around the new player, and a clean
 * record. The save keeps its id, its season counter and its family record (legacy). The caller archives the old career
 * (stats, awards, relationships) before this runs; everything about it is cleared here.
 */
export function beginGeneration(state: GameState, rng: RNG, heir: Athlete, o: GenerationSetup): Team {
  const names = new NameBook();
  names.reserve(heir.firstName, heir.lastName);
  const { teams, athletes } = generateLeagueTeams(rng, 'hs', names);
  const team = teams[clamp(o.schoolIndex, 0, teams.length - 1)];
  heir.teamId = team.id;
  heir.persistent = true;
  const all = seatAthlete(athletes, team, heir);

  const season = state.career.season + 1;
  state.athletes = Object.fromEntries(all.map((a) => [a.id, a]));
  state.teams = Object.fromEntries(teams.map((t) => [t.id, t]));
  state.league = createLeague(rng, 'hs', teams.map((t) => t.id));
  state.npcs = {};
  state.player = newPlayer(heir.id, o.hometown, o.traits, { season, money: o.money, reputation: o.reputation, followers: o.followers, origin: o.origin });
  state.career = newCareerState(team.id, season, state.career.calendarYear + o.yearsLater);
  state.gameLog = [];
  state.leagueStats = {};
  state.lastBox = null;
  state.story = { log: [], seasonSummaries: [], flags: { story_athletes_v2: true }, arcs: [], careerSummary: '', defining: [], threads: [], ripples: [] };
  state.news = [];
  state.effectLog = [];
  state.feed = [];
  state.offers = [];
  state.weekLog = { lines: [] };
  state.paper = [];
  state.recruiting = { points: 2, suitors: [], targets: [], history: [] };
  state.transactions = [];
  state.goals = [];
  seedHighSchoolCast(state, rng, team, teams);
  applyOriginStart(state, { ratings: false }); // the heir's ratings already carry the head start and build (see planHeir)
  return team;
}

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

  const allAthletes = seatAthlete(athletes, team, user);

  const state: GameState = {
    version: SAVE_VERSION,
    id: rng.id('save'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rngState: 0,
    player: newPlayer(user.id, input.hometown, input.traits, { season: 1, origin: input.origin ? { ...input.origin, chosen: true } : undefined }),
    athletes: Object.fromEntries(allAthletes.map((a) => [a.id, a])),
    npcs: {},
    teams: Object.fromEntries(teams.map((t) => [t.id, t])),
    league: createLeague(rng, level, teams.map((t) => t.id)),
    career: newCareerState(team.id, 1, new Date().getFullYear()),
    gameLog: [],
    leagueStats: {},
    lastBox: null,
    story: { log: [], seasonSummaries: [], flags: { story_athletes_v2: true }, arcs: [], careerSummary: '', defining: [], threads: [], ripples: [] },
    news: [],
    effectLog: [],
    feed: [],
    offers: [],
    transactions: [],
    recruiting: { points: 2, suitors: [], targets: [], history: [] },
    weekLog: { lines: [] },
    paper: [],
    legacy: { generation: 1, family: '', inherited: 0, relation: 'none', parent: '', lineage: [] },
    goals: [],
    records: {},
    honors: [],
  };

  seedHighSchoolCast(state, rng, team, teams);
  applyOriginStart(state);
  state.rngState = rng.state;
  ensureGoals(state);
  addNews(state, `${user.firstName} ${user.lastName} joins ${team.name} as a freshman.`);
  return state;
}

export function addNpc(state: GameState, npc: Npc): Npc {
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
  friendAth.age = user.age; // same class as you, so they do not graduate a year early
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

/** Your spot on the depth chart, counting how much your coach trusts you (same ranking the game simulation uses). */
export function userRole(state: GameState): { rank: number; label: string } {
  const c = coachStanding(state);
  return { rank: c.rank, label: c.label };
}

/* ───────────────────────── Weekly flow ───────────────────────── */

export function doTraining(state: GameState, focus: TrainingFocus): TrainingResult {
  return withRng(state, (rng) => {
    const intensity = (state.player.traits.includes('gym_rat') ? 1.15 : 1) * modsOf(state).trainingMul;
    const r = train(state, rng, focus, state.player.traits.includes('scholar') && focus === 'study' ? 1.3 * modsOf(state).trainingMul : intensity);
    practiceEffort(state, focus);
    checkBadgeUnlocks(state);
    state.career.step = 'scene';
    return r;
  });
}

export function doSummerTraining(state: GameState, focuses: RatingKey[]) {
  return withRng(state, (rng) => {
    const gains = offseasonDevelopment(state, rng, focuses);
    checkBadgeUnlocks(state);
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
  /** How the coach reacted to your night. */
  coach: CoachChange;
  /** Ids of badges earned from this game. */
  newBadges: string[];
  /** You played hurt and made it worse. */
  aggravated: boolean;
  playedHurt: boolean;
  /** The game plan you went in with. */
  plan: { id: PlanId; film: boolean } | null;
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
      shots: sim.feed.filter((e) => e.shot?.user).map((e) => ({ x: Math.round(e.shot!.x * 1000) / 1000, y: Math.round(e.shot!.y * 1000) / 1000, m: e.shot!.made })),
    });
  }
  state.lastBox = { gameId: g.id, box };

  const plan = state.career.plan;
  const playedHurt = !!line && line.sec > 0 && isPlayingHurt(state);
  const wear = withRng(state, (rng) => {
    const totalSec = LEVEL_CONFIG[state.career.level].quarterMinutes * 60 * 4;
    // pacing yourself ("Save your legs") means the game takes less out of you
    const effSec = line ? line.sec * (1 - energySavedBy(plan)) : 0;
    const injury = line ? postGameWear(state, rng, effSec, totalSec) : null;
    // playing on an injury can make it worse
    let aggravated = false;
    if (playedHurt && !injury && state.player.injury && rng.chance(AGGRAVATE_CHANCE)) {
      state.player.injury.weeks += 2;
      state.player.injuryHistory++;
      aggravated = true;
    }
    // sim the rest of the league this week
    simOtherGames(state, rng, state.career.week, us, !!g.playoffRound);
    return { injury, aggravated };
  });
  const report = wear.injury;

  // morale / reputation from the result (engine-side, deterministic)
  const gs = line ? gameScore(line) : 0;
  const p = state.player;
  if (playedHurt) p.morale = clamp(p.morale + 2, 0, 100);
  p.clutchWins += sim.momentResults.filter((m) => m.clutch && m.success).length;
  const coach = coachReacts(state, { line, won, playoff: !!g.playoffRound, playedHurt });
  if (wear.aggravated) addNews(state, `${userAthlete(state).lastName} aggravated the ${p.injury?.desc ?? 'injury'} playing through it.`);
  // who the player is changes how a result lands: a steady head takes a loss better, a famous name feels it more
  const om = modsOf(state);
  const moraleSwing = (won ? 4 : -4) + (gs > 18 ? 3 : gs < 4 && line && line.sec > 600 ? -3 : 0);
  p.morale = clamp(p.morale + Math.round(moraleSwing * (moraleSwing >= 0 ? om.moraleGainMul : om.moraleLossMul)), 0, 100);
  p.reputation = clamp(p.reputation + Math.round(((gs > 22 ? 2 : gs > 15 ? 1 : 0) + (won && g.playoffRound ? 1 : 0)) * om.repGain), 0, 100);
  const followerGain = Math.round((gs > 0 ? gs : 0) * (p.traits.includes('showman') ? 12 : 6) * (1 + p.reputation / 25) * om.followerMul);
  p.followers += followerGain;

  const opp = state.teams[theirBox.teamId];
  if (line && gs > 22) addNews(state, `${userAthlete(state).lastName} erupts vs ${opp.name}: ${line.pts} pts, ${line.orb + line.drb} reb, ${line.ast} ast.`);
  if (report) addNews(state, `${userAthlete(state).lastName} suffered a ${report} and will miss time.`);

  chemistryAfterGame(state, { won, margin: Math.abs(ourBox.score - theirBox.score) });
  // a marked game against the rival's team: the series, the headline, what it does to you
  recordRivalryGame(state, theirBox.teamId, won, `${ourBox.score}-${theirBox.score}`);
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

  // badges earned from this game's numbers
  const earned = checkBadgeUnlocks(state);
  for (const b of earned) addNews(state, `${userAthlete(state).lastName} earns the ${b.name} badge.`);

  // the world reacts: social posts, and sometimes a reporter wants a word
  withRng(state, (rng) => {
    const facts = { won, teamScore: ourBox.score, oppScore: theirBox.score, oppId: theirBox.teamId, playoff: !!g.playoffRound, line, gameScore: gs };
    postGamePosts(state, rng, { ...facts, clutchHeroics: sim.momentResults.some((m) => m.clutch && m.success) });
    state.career.gamesSincePress++;
    const press = maybePress(state, rng, { ...facts, roundName });
    if (press) state.career.press = press;
    for (const b of earned) systemPost(state, rng, 'media', `${userAthlete(state).lastName} has earned the ${b.name} badge.`);
  });

  state.career.plan = null;
  state.career.playHurt = false;
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
    coach,
    newBadges: earned.map((b) => b.id),
    aggravated: wear.aggravated,
    playedHurt,
    plan,
  };
}

/* ───────────────────────── Game prep ───────────────────────── */

/**
 * Choose the game plan for the next game. Film study costs energy, which is refunded if you change your mind
 * before tip-off. Returns false if the choice is not allowed right now.
 */
export function setGamePlan(state: GameState, id: PlanId, film: boolean): boolean {
  if (state.career.step !== 'game') return false;
  const prev = state.career.plan;
  const wasFilm = !!prev?.film;
  if (film && !wasFilm && state.player.energy < FILM_ENERGY_COST + 5) return false;
  if (film !== wasFilm) state.player.energy = clamp(state.player.energy + (film ? -FILM_ENERGY_COST : FILM_ENERGY_COST), 0, 100);
  state.career.plan = { id, film };
  return true;
}

/** Decide whether to play through a minor injury in the next game. */
export function setPlayHurt(state: GameState, on: boolean): boolean {
  if (state.career.step !== 'game') return false;
  if (on && !canPlayHurt(state)) return false;
  state.career.playHurt = on;
  return true;
}

export interface WeekAdvance {
  seasonEnded: boolean;
  messages: string[];
}

/** Move the calendar forward after the current week's steps are done. A random moment may be waiting when the new week starts. */
export function advanceWeek(state: GameState): WeekAdvance {
  const r = advanceWeekCore(state);
  withRng(state, (rng) => rollLifeEvent(state, rng));
  return r;
}

function advanceWeekCore(state: GameState): WeekAdvance {
  const c = state.career;
  const messages: string[] = [];
  // every week of the regular season pays: salary or stipend, endorsements, minus taxes and living costs
  if (c.phase === 'regular') payWeek(state);
  weeklyRecovery(state);
  weeklyChemistry(state);
  weeklyRomance(state);
  weeklyHoldout(state);
  withRng(state, (rng) => tickRecruiting(state, rng));
  // grades slip when you do not keep up with school
  if (state.career.level !== 'pro') {
    const before = state.player.academics;
    state.player.academics = clamp(Math.round((before - WEEKLY_GPA_DRIFT * modsOf(state).gpaDrift * (hasService(state, 'tutor') ? 0 : 1)) * 1000) / 1000, 0, 4);
    if (before >= MIN_GPA && state.player.academics < MIN_GPA) addNews(state, `${userAthlete(state).lastName} is now academically ineligible.`);
  }
  for (const msg of updateEstrangement(state)) addNews(state, msg);
  // appearances and shoots tire you out; new brands come knocking
  state.player.energy = clamp(state.player.energy - weeklyDealEnergy(state), 0, 100);
  expireOffers(state);
  withRng(state, (rng) => {
    const offer = maybeOffer(state, rng);
    if (offer) addNews(state, `${offer.brand} is interested in signing ${userAthlete(state).lastName}.`);
  });

  return withRng(state, (rng) => {
    if (c.phase === 'preseason') {
      publishIssue(state, 'preview');
      c.phase = 'regular';
      c.week = 1;
      c.step = 'training';
      return { seasonEnded: false, messages };
    }

    if (c.phase === 'regular') {
      // make sure every game of this week is played (e.g., user was injured/bye)
      simOtherGames(state, rng, c.week, '__none__');
      leagueInSeasonTrades(state, rng);
      midseasonHeadlines(state);
      publishIssue(state, 'weekly');
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
      publishIssue(state, 'weekly');
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
  closeSeasonRecords(state);
  recordSeasonHonors(state, scoredPlayers(state));
  computeAwards(state, messages);
  publishIssue(state, 'recap');
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
  const scored = scoredPlayers(state);

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
  notePeak(state);
  state.career.season++;
  state.career.calendarYear++;
  state.career.phase = 'preseason';
  state.career.week = 0;
  state.career.step = 'scene';
  state.leagueStats = {};
  state.lastBox = null;
  state.league = createLeague(rng, state.career.level, state.league.teamIds);
  state.player.energy = clamp(state.player.energy + 30, 0, 100);
  // past choices whose time has come
  activateDueRipples(state);
  rollFinanceSeason(state);
  chemistryNewSeason(state);
  refreshStoryTitles(state);
  // this season's recruiting targets (a player in their last year is leaving, so there is nobody to recruit for)
  if (state.career.level === 'pro' || state.career.year < 4) refreshTargets(state, rng);
  else state.recruiting.targets = [];
}

function ageEveryone(state: GameState) {
  for (const a of Object.values(state.athletes)) a.age++;
}

function startNextSeason(state: GameState, rng: RNG, messages: string[]): WeekAdvance {
  const c = state.career;
  // a season without a new injury lets the body recover a little
  state.player.injuryHistory = Math.max(0, state.player.injuryHistory - 1);
  // everyone's season gets filed away before the stats reset
  archiveSeasonStats(state);
  recordStorySeasons(state);
  // endorsement money came in week by week; the turn of the season only retires finished deals and checks for blow-ups
  if (state.player.deals.length) {
    const pay = settleDeals(state, rng, false);
    const earned = state.player.finance.endorse;
    if (earned > 0) {
      messages.push(`Endorsements paid $${earned.toLocaleString()}.`);
      addNews(state, `${userAthlete(state).lastName} earns $${earned.toLocaleString()} from endorsements this season.`);
    }
    for (const line of pay.lines.filter((l) => /blew up/.test(l))) messages.push(line);
  }
  ageEveryone(state);
  developNpcs(state, rng);
  developStoryAthletes(state, rng);
  const nextYear = c.year + 1;

  if (c.level === 'hs' && nextYear > 4) {
    classCommitNews(state, rng);
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
      k.yearsLeft--; // the salary was paid week by week through the season
      if (k.yearsLeft <= 0) {
        c.phase = 'free_agency';
        c.step = 'scene';
        messages.push('Your contract is up. You are a free agent.');
        return { seasonEnded: false, messages };
      }
    }
  }

  c.year = nextYear;
  leagueOffseasonMoves(state, rng); // transfers and signings happen before graduates leave and newcomers arrive
  turnoverRosters(state, rng);
  retireStaleNpcs(state);
  promoteTeammate(state, rng);
  newSeasonCommon(state, rng);
  if (c.level === 'hs' && c.year === 3) introduceScout(state, rng);
  messages.push(`Season ${c.season} begins.`);
  return { seasonEnded: false, messages };
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
function enterLevel(state: GameState, rng: RNG, level: Level, tpl: TeamTemplate, drafted?: Map<string, string>) {
  // school NIL deals end when you leave, and pending offers lapse
  state.offers = [];
  state.player.deals = [];
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
  // schools courting you and players you were chasing belong to the old level
  state.recruiting.suitors = [];
  state.recruiting.targets = [];
  // last level's numbers mean nothing here
  for (const n of Object.values(state.npcs)) n.lastSeason = undefined;
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
    const calledBy = drafted?.get(ath.id);
    if (calledBy && teams.some((t) => t.name === calledBy)) {
      // someone from your story who was picked goes to the team that picked them
      target = teams.find((t) => t.name === calledBy)!;
    } else if (n.role === 'rival') {
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
  romanceNewLevel(state);
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
    // the school that has been calling the most gets a spot on the list, even if it reaches a little
    const suitor = topSuitor(state);
    const suitorTpl = suitor && suitor.interest >= 45 && gpaOk ? COLLEGE_TEAMS.find((t) => t.name === suitor.name) : undefined;
    if (suitorTpl && !guaranteed.includes(suitorTpl)) guaranteed[guaranteed.length - 1] = suitorTpl;
    return guaranteed.map((t) => ({
      name: t.name,
      mascot: t.mascot,
      prestige: t.prestige,
      colors: t.colors,
      pitch: (suitorOf(state, t.name) && suitorOf(state, t.name)!.interest >= 40 ? `They have been in touch ${suitorOf(state, t.name)!.contacts || 'for months'}${suitorOf(state, t.name)!.contacts ? ' times' : ''}${suitorOf(state, t.name)!.visited ? ' and you have visited' : ''}. ` : '') + (t.prestige >= 85 ? 'Blue-blood program. Title or bust, national TV every week.' : t.prestige >= 70 ? 'Rising power that wants to build around you.' : 'You would be the face of the program from day one.'),
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

export { draftStock, projectedPick };

export interface DraftResult {
  pick: number | null;
  teamName: string;
  salary: number;
  years: number;
  /** Every pick in the draft, in order. */
  picks: DraftPick[];
}

export function runDraft(state: GameState): DraftResult {
  return withRng(state, (rng) => {
    const sim = simulateDraft(state, rng);
    const pick = sim.userPick;
    // worse teams pick earlier: reverse prestige order
    const order = [...PRO_TEAMS].sort((a, b) => a.prestige - b.prestige);
    const tpl = pick ? order[(pick - 1) % order.length] : rng.pick(PRO_TEAMS);
    const salary = pick ? Math.round((pick <= 12 ? 11_000_000 - (pick - 1) * 700_000 : 2_400_000 - (pick - 13) * 70_000) / 1000) * 1000 : 1_100_000;
    const years = pick && pick <= 12 ? 4 : 2;
    enterLevel(state, rng, 'pro', tpl, sim.drafted);
    state.player.draftPick = pick;
    state.player.draftBoost = 0;
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
    // the night's top of the board, and the people from your story who were called
    for (const p of sim.picks.slice(0, 5).filter((x) => !x.isUser)) logTransaction(state, 'draft', `#${p.pick}: ${p.team} take ${p.name} (${p.position}, ${p.college}).`);
    for (const p of sim.picks.filter((x) => (x.isRival || x.isFriend) && x.pick > 5)) logTransaction(state, 'draft', `#${p.pick}: ${p.team} take ${p.name}${p.isRival ? ', your old rival' : ', your old friend'}.`);
    return { pick, teamName: `${tpl.name} ${tpl.mascot}`, salary, years, picks: sim.picks };
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
  /** Room under the cap this team has, before signing you. */
  capSpace: number;
}

export function marketValue(state: GameState): number {
  const ovr = overall(userAthlete(state).ratings);
  // below 62 the base would be negative, and a negative number to a fractional power is NaN
  const v = Math.max(1.1, (Math.max(0, ovr - 62) / 26) ** 2.2 * 45) * 1_000_000;
  return Math.round(v / 100_000) * 100_000;
}

export function freeAgencyOffers(state: GameState): FaOffer[] {
  const value = marketValue(state);
  const age = userAthlete(state).age;
  const currentName = userTeam(state).name;
  return withRng(state, (rng) => {
    // room under the cap each team has for you (your old team gets your old salary back)
    const roomFor = (t: TeamTemplate) => {
      const team = Object.values(state.teams).find((x) => x.level === 'pro' && x.name === t.name && state.league.teamIds.includes(x.id));
      return team ? Math.max(MIN_SALARY, capSpace(state, team) + (team.id === state.career.teamId && state.player.contract ? state.player.contract.salary : 0)) : 100_000_000;
    };
    const shuffled = rng.shuffle([...PRO_TEAMS]);
    // teams that can actually pay you come first; capped-out teams only fill the list if there are not enough
    const viable = shuffled.filter((t) => roomFor(t) >= value * 0.6);
    const teams = (viable.length >= 3 ? viable : shuffled).slice(0, 3);
    if (!teams.some((t) => t.name === currentName)) teams.unshift(PRO_TEAMS.find((t) => t.name === currentName)!);
    return teams.map((t) => {
      // a team can only pay what fits under its cap (never less than the minimum)
      const room = roomFor(t);
      const want = Math.round((value * rng.range(0.85, 1.15) * (t.name === currentName ? 1.05 : 1)) / 100_000) * 100_000;
      return {
        teamName: t.name,
        mascot: t.mascot,
        prestige: t.prestige,
        colors: t.colors,
        salary: Math.max(MIN_SALARY, Math.min(want, Math.round(room / 100_000) * 100_000)),
        years: age >= 32 ? rng.int(1, 2) : rng.int(2, 5),
        current: t.name === currentName,
        capSpace: room,
      };
    });
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
      adoptCoach(state, rng, target.coachName, target.name, { respect: 30, trust: 25 });
    }
    state.player.contract = { teamId: c.teamId, salary: offer.salary, yearsLeft: offer.years };
    c.year++;
    leagueOffseasonMoves(state, rng); // the rest of the market signs around you
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
