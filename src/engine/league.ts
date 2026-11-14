import { LEVEL_CONFIG } from '../data/teams';
import type { Athlete, BoxScore, GameState, League, Level, ScheduledGame, Team } from '../state/schemas';
import { GameSim, type SimOptions, type SimTeamInput } from './gameSim';
import { RNG } from './rng';

/** Circle-method single round robin. Returns weeks of [home, away] pairs. */
export function roundRobin(rng: RNG, teamIds: string[]): [string, string][][] {
  const ids = rng.shuffle([...teamIds]);
  if (ids.length % 2 === 1) ids.push('BYE');
  const n = ids.length;
  const weeks: [string, string][][] = [];
  const arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    weeks.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  return weeks;
}

export function createLeague(rng: RNG, level: Level, teamIds: string[]): League {
  const weeks = roundRobin(rng, teamIds);
  const schedule: ScheduledGame[] = [];
  weeks.forEach((pairs, wi) => {
    pairs.forEach(([h, a]) => {
      schedule.push({ id: rng.id('g'), week: wi + 1, homeId: h, awayId: a, played: false });
    });
  });
  return {
    level,
    name: LEVEL_CONFIG[level].leagueName,
    teamIds,
    schedule,
    standings: Object.fromEntries(teamIds.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }])),
    regularWeeks: weeks.length,
    playoffTeams: LEVEL_CONFIG[level].playoffTeams,
    champion: null,
  };
}

export function sortedStandings(league: League): string[] {
  return [...league.teamIds].sort((a, b) => {
    const A = league.standings[a];
    const B = league.standings[b];
    const pa = A.w / Math.max(1, A.w + A.l);
    const pb = B.w / Math.max(1, B.w + B.l);
    if (pb !== pa) return pb - pa;
    return B.pf - B.pa - (A.pf - A.pa);
  });
}

export function teamRoster(state: GameState, teamId: string): Athlete[] {
  const t = state.teams[teamId];
  return t.rosterIds.map((id) => state.athletes[id]).filter(Boolean);
}

/** Roster eligible to play: injured user is held out. */
export function simInput(state: GameState, team: Team): SimTeamInput {
  const injured = state.player.injury && state.player.injury.weeks > 0 ? state.player.athleteId : null;
  return { teamId: team.id, abbrev: team.abbrev, roster: teamRoster(state, team.id).filter((a) => a.id !== injured) };
}

export function simOptions(state: GameState, keyMoments: boolean): SimOptions {
  const cfg = LEVEL_CONFIG[state.league.level];
  const p = state.player;
  // energy & morale shade the user's effective ratings
  const mod = Math.round((p.energy - 70) / 10 + (p.morale - 50) / 15);
  const rivalIds = Object.values(state.npcs)
    .filter((n) => n.athleteId && n.relationship.rivalry >= 40)
    .map((n) => n.athleteId!);
  return {
    quarterMinutes: cfg.quarterMinutes,
    levelMean: cfg.ratingMean,
    pace: cfg.pace,
    foulOut: state.league.level === 'pro' ? 6 : 5,
    keyMoments,
    userAthleteId: p.athleteId,
    ratingMods: { [p.athleteId]: mod },
    rivalIds,
    userTraits: p.traits,
  };
}

export function recordResult(league: League, game: ScheduledGame, box: BoxScore) {
  game.played = true;
  game.homeScore = box.home.score;
  game.awayScore = box.away.score;
  if (game.playoffRound) return; // playoffs don't change the regular season table
  const h = league.standings[game.homeId];
  const a = league.standings[game.awayId];
  h.pf += box.home.score;
  h.pa += box.away.score;
  a.pf += box.away.score;
  a.pa += box.home.score;
  if (box.home.score > box.away.score) {
    h.w++;
    a.l++;
  } else {
    a.w++;
    h.l++;
  }
}

/** Quick-sims every unplayed game of a week except the one involving `skipTeamId`. */
export function simOtherGames(state: GameState, rng: RNG, week: number, skipTeamId: string, playoff = false) {
  const games = state.league.schedule.filter(
    (g) => g.week === week && !g.played && g.homeId !== skipTeamId && g.awayId !== skipTeamId && !!g.playoffRound === playoff,
  );
  const opts = { ...simOptions(state, false), userAthleteId: undefined };
  for (const g of games) {
    const sim = new GameSim(rng, simInput(state, state.teams[g.homeId]), simInput(state, state.teams[g.awayId]), opts);
    const box = sim.runToEnd();
    recordResult(state.league, g, box);
    accumulateLeagueStats(state, box);
  }
}

export function accumulateLeagueStats(state: GameState, box: BoxScore) {
  for (const t of [box.home, box.away]) {
    for (const l of t.players) {
      if (l.sec <= 0) continue;
      const s = (state.leagueStats[l.athleteId] ??= { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
      s.gp++;
      s.min += l.sec / 60;
      s.pts += l.pts;
      s.reb += l.orb + l.drb;
      s.ast += l.ast;
      s.stl += l.stl;
      s.blk += l.blk;
    }
  }
}

export function userGameForWeek(state: GameState, week: number): ScheduledGame | undefined {
  const t = state.career.teamId;
  return state.league.schedule.find((g) => g.week === week && (g.homeId === t || g.awayId === t) && !g.played);
}

/* ── Playoffs: single elimination, seeded 1vN ── */

export function seedPlayoffs(league: League, rng: RNG): void {
  const seeds = sortedStandings(league).slice(0, league.playoffTeams);
  const week = league.regularWeeks + 1;
  for (let i = 0; i < seeds.length / 2; i++) {
    league.schedule.push({ id: rng.id('g'), week, homeId: seeds[i], awayId: seeds[seeds.length - 1 - i], playoffRound: 1, played: false });
  }
}

export function currentPlayoffRound(league: League): number {
  return Math.max(0, ...league.schedule.filter((g) => g.playoffRound).map((g) => g.playoffRound!));
}

/** After a round completes, create the next round. Returns champion id if finished. */
export function advancePlayoffs(league: League, rng: RNG): string | null {
  const round = currentPlayoffRound(league);
  const games = league.schedule.filter((g) => g.playoffRound === round);
  if (games.some((g) => !g.played)) return null;
  const winners = games.map((g) => (g.homeScore! > g.awayScore! ? g.homeId : g.awayId));
  if (winners.length === 1) {
    league.champion = winners[0];
    return winners[0];
  }
  const week = league.regularWeeks + round + 1;
  for (let i = 0; i < winners.length / 2; i++) {
    league.schedule.push({ id: rng.id('g'), week, homeId: winners[i], awayId: winners[winners.length - 1 - i], playoffRound: round + 1, played: false });
  }
  return null;
}

export function playoffRoundName(league: League, round: number): string {
  const totalRounds = Math.log2(league.playoffTeams);
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Championship';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${round}`;
}

export function teamIsAlive(league: League, teamId: string): boolean {
  const round = currentPlayoffRound(league);
  if (round === 0) return false;
  return league.schedule.some((g) => g.playoffRound === round && (g.homeId === teamId || g.awayId === teamId) && (!g.played || (g.homeId === teamId ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!)));
}
