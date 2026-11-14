import { LEVEL_CONFIG, yearLabel } from '../data/teams';
import type { GameState, Level } from '../state/schemas';
import { playoffRoundName } from './league';
import { overall } from './ratings';
import { gameScore, lineSummary, seasonAverages, seasonEntries } from './stats';

export interface SeasonReview {
  season: number;
  level: Level;
  levelLabel: string;
  yearLabel: string;
  teamName: string;
  mascot: string;
  abbrev: string;
  colors: [string, string];
  w: number;
  l: number;
  rank: number;
  teams: number;
  playoff: string;
  champion: boolean;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  mpg: number;
  overall: number;
  awards: string[];
  best: { vs: string; score: string; line: string } | null;
}

/** Facts for the end-of-season highlight card. Call right after the season ends, before the next one is created. */
export function buildSeasonReview(state: GameState, season: number): SeasonReview {
  const c = state.career;
  const team = state.teams[c.teamId];
  const st = state.league.standings[c.teamId] ?? { w: 0, l: 0, pf: 0, pa: 0 };
  const sorted = [...state.league.teamIds].sort((a, b) => {
    const A = state.league.standings[a];
    const B = state.league.standings[b];
    return B.w / Math.max(1, B.w + B.l) - A.w / Math.max(1, A.w + A.l) || B.pf - B.pa - (A.pf - A.pa);
  });
  const rank = sorted.indexOf(c.teamId) + 1;

  const mine = state.league.schedule.filter((g) => g.playoffRound && g.played && (g.homeId === c.teamId || g.awayId === c.teamId));
  const champion = state.league.champion === c.teamId;
  let playoff: string;
  if (champion) playoff = 'League champions';
  else if (!mine.length) playoff = 'Missed the playoffs';
  else {
    const last = mine.reduce((a, b) => (b.playoffRound! > a.playoffRound! ? b : a));
    playoff = `Lost in the ${playoffRoundName(state.league, last.playoffRound!).toLowerCase()}`;
  }

  const avg = seasonAverages(state.gameLog, season);
  const entries = seasonEntries(state.gameLog, season).filter((e) => e.line.sec > 0);
  const top = entries.length ? entries.reduce((a, b) => (gameScore(b.line) > gameScore(a.line) ? b : a)) : null;
  const a = state.athletes[state.player.athleteId];

  return {
    season,
    level: c.level,
    levelLabel: LEVEL_CONFIG[c.level].label,
    yearLabel: yearLabel(c.level, c.year),
    teamName: team.name,
    mascot: team.mascot,
    abbrev: team.abbrev,
    colors: team.colors,
    w: st.w,
    l: st.l,
    rank,
    teams: sorted.length,
    playoff,
    champion,
    gp: avg.gp,
    ppg: avg.ppg,
    rpg: avg.rpg,
    apg: avg.apg,
    mpg: avg.mpg,
    overall: overall(a.ratings),
    awards: state.player.awards.filter((x) => x.season === season && !x.name.endsWith('Champion')).map((x) => x.name),
    best: top ? { vs: state.teams[top.oppId]?.name ?? 'Opponent', score: `${top.teamScore > top.oppScore ? 'W' : 'L'} ${top.teamScore}-${top.oppScore}`, line: lineSummary(top.line) } : null,
  };
}
