import { LEVEL_CONFIG, yearLabel } from '../data/teams';
import type { Athlete, GameLogEntry, GameState, Level } from '../state/schemas';
import { RATING_KEYS, RATING_LABELS } from '../state/schemas';
import { allStarIds } from './awards';
import { salaryOf } from './contracts';
import { STAT_DEFS, perGame, rankOf, type PerGame, type StatKey } from './leaders';
import { ARCHETYPE_INFO, formatHeight, overall } from './ratings';
import { averages, gameScore, totals } from './stats';
import { classLabel, rosterRole, teamRank } from './storyAthletes';

/**
 * Everything the player card shows about anyone in the league: who they are, how good they are, what they are
 * averaging, where that ranks, how last year went, and how they connect to you. Built from the save, never stored.
 */

export interface CardRating {
  key: string;
  label: string;
  value: number;
  /** Their rating minus yours. */
  vsYou: number;
}

export interface CardRecentGame {
  week: number;
  opp: string;
  won: boolean;
  score: string;
  line: string;
  gs: number;
}

export interface AthleteCard {
  id: string;
  name: string;
  isYou: boolean;
  position: string;
  archetype: string;
  age: number;
  classText: string;
  height: string;
  ovr: number;
  pot: number;
  team: { id: string; name: string; mascot: string; abbrev: string; colors: [string, string] } | null;
  levelText: string;
  teamRank: number;
  role: string;
  /** How they connect to your story: You, Rival, Best friend, Teammate, All-Star, Recruit target... */
  tags: string[];
  ratings: CardRating[];
  season: PerGame | null;
  /** League rank in each headline category (null if they do not qualify). */
  ranks: Partial<Record<StatKey, number | null>>;
  prev: Athlete['prev'] | null;
  contract: { salary: number; years: number | null } | null;
  /** Their career at a glance (the player's own career only). */
  career: ReturnType<typeof averages> | null;
  recent: CardRecentGame[];
}

const HEADLINE: StatKey[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'fgPct', 'tpPct', 'ftPct'];

function recentGames(state: GameState): CardRecentGame[] {
  return state.gameLog
    .slice(-6)
    .reverse()
    .map((e: GameLogEntry) => ({
      week: e.week,
      opp: state.teams[e.oppId]?.name ?? '?',
      won: e.teamScore > e.oppScore,
      score: `${e.teamScore}-${e.oppScore}`,
      line: `${e.line.pts} pts, ${e.line.orb + e.line.drb} reb, ${e.line.ast} ast, ${e.line.fgm}-${e.line.fga} FG`,
      gs: Math.round(gameScore(e.line) * 10) / 10,
    }));
}

/** Null if there is nobody with that id. */
export function athleteCard(state: GameState, id: string): AthleteCard | null {
  const a = state.athletes[id];
  if (!a) return null;
  const me = state.athletes[state.player.athleteId];
  const isYou = a.id === me.id;
  const team = a.teamId ? state.teams[a.teamId] : null;
  const level: Level = state.career.level;
  const npc = Object.values(state.npcs).find((n) => n.active && n.athleteId === a.id);
  const rank = teamRank(state, a);
  const tags: string[] = [];
  if (isYou) tags.push('You');
  if (npc?.role === 'rival') tags.push('Rival');
  if (npc?.role === 'friend') tags.push('Best friend');
  if (npc?.role === 'teammate') tags.push('Teammate');
  if (allStarIds(state).includes(a.id)) tags.push('All-Star');
  if (state.recruiting.targets.some((t) => t.athleteId === a.id)) tags.push('Your recruiting target');
  if (state.recruiting.history.some((h) => h.name === `${a.firstName} ${a.lastName}` && h.outcome === 'signed')) tags.push('Signed by you');
  const s = state.leagueStats[a.id];
  const season = s && s.gp > 0 ? perGame(s) : null;
  const ranks: AthleteCard['ranks'] = {};
  if (season) for (const k of HEADLINE) ranks[k] = rankOf(state, a.id, k);
  const contract =
    level === 'pro' ? (isYou && state.player.contract ? { salary: state.player.contract.salary, years: state.player.contract.yearsLeft } : { salary: salaryOf(a), years: a.contractYears ?? null }) : null;
  return {
    id: a.id,
    name: `${a.firstName} ${a.lastName}`,
    isYou,
    position: a.position,
    archetype: ARCHETYPE_INFO[a.archetype].label,
    age: a.age,
    classText: level === 'pro' ? `${a.age} years old` : classLabel(level, a.age),
    height: formatHeight(a.heightIn),
    ovr: overall(a.ratings),
    pot: a.potential,
    team: team ? { id: team.id, name: team.name, mascot: team.mascot, abbrev: team.abbrev, colors: team.colors } : null,
    levelText: team ? `${LEVEL_CONFIG[level].label}${isYou ? ` · ${yearLabel(level, state.career.year)}` : ''}` : 'Free agent',
    teamRank: rank,
    role: rank ? rosterRole(rank) : 'not on a team',
    tags,
    ratings: RATING_KEYS.map((k) => ({ key: k, label: RATING_LABELS[k], value: a.ratings[k], vsYou: a.ratings[k] - me.ratings[k] })),
    season,
    ranks,
    prev: a.prev ?? null,
    contract,
    career: isYou ? averages(totals(state.gameLog)) : null,
    recent: isYou ? recentGames(state) : [],
  };
}

export { STAT_DEFS };
