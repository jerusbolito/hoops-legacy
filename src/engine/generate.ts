import { PERSONALITIES } from '../data/names';
import { LEVEL_CONFIG, TEAMS_BY_LEVEL, type TeamTemplate } from '../data/teams';
import type { Archetype, Athlete, Level, Npc, NpcRole, Position, Relationship, Team } from '../state/schemas';
import { PROFILED_ROLES, pickProfile, profileById } from './characters';
import { NameBook } from './nameBook';
import { ARCHETYPE_INFO, heightFor, makeRatings } from './ratings';
import { RNG, clamp } from './rng';

const ARCHETYPES: Archetype[] = ['slasher', 'sharpshooter', 'playmaker', 'big', 'two-way'];
const ROSTER_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C', 'SF', 'SG', 'PF'];

function archetypeFor(rng: RNG, pos: Position): Archetype {
  const fits = ARCHETYPES.filter((a) => ARCHETYPE_INFO[a].positions.includes(pos));
  return rng.pick(fits);
}

function pickName(rng: RNG, opts: { teamId?: string | null; names?: NameBook }) {
  const d = (opts.names ?? new NameBook()).draw(rng, { team: opts.teamId ?? null });
  return { firstName: d.firstName, lastName: d.lastName };
}

export function generateAthlete(
  rng: RNG,
  level: Level,
  opts: { position?: Position; mean?: number; teamId?: string | null; age?: number; names?: NameBook } = {},
): Athlete {
  const cfg = LEVEL_CONFIG[level];
  const position = opts.position ?? rng.pick(['PG', 'SG', 'SF', 'PF', 'C'] as Position[]);
  const archetype = archetypeFor(rng, position);
  const ratings = makeRatings(rng, opts.mean ?? cfg.ratingMean, cfg.ratingSd, archetype);
  const age = opts.age ?? rng.int(cfg.ageRange[0], cfg.ageRange[1]);
  const youth = Math.max(0, 27 - age);
  const ovrish = Object.values(ratings).reduce((a, b) => a + b, 0) / 9;
  return {
    id: rng.id('ath'),
    ...pickName(rng, opts),
    position,
    archetype,
    heightIn: heightFor(rng, position),
    age,
    ratings,
    potential: Math.round(clamp(ovrish + youth * rng.range(1, 3.2), ovrish, 97)),
    teamId: opts.teamId ?? null,
    persistent: false,
  };
}

/** Prestige → shift in roster mean so good programs are actually good. */
function prestigeShift(prestige: number): number {
  return (prestige - 60) / 8;
}

export function generateTeam(rng: RNG, level: Level, tpl: TeamTemplate, names: NameBook = new NameBook()): { team: Team; athletes: Athlete[] } {
  const cfg = LEVEL_CONFIG[level];
  const teamId = rng.id('team');
  const athletes: Athlete[] = [];
  for (let i = 0; i < cfg.rosterSize; i++) {
    const starterBoost = i < 5 ? 2 : i < 8 ? -2 : -6;
    athletes.push(
      generateAthlete(rng, level, {
        position: ROSTER_POSITIONS[i],
        mean: cfg.ratingMean + prestigeShift(tpl.prestige) + starterBoost,
        teamId,
        names,
      }),
    );
  }
  const coach = names.draw(rng, { gender: 'any' });
  return {
    team: {
      id: teamId,
      level,
      name: tpl.name,
      mascot: tpl.mascot,
      abbrev: tpl.abbrev,
      colors: tpl.colors,
      prestige: tpl.prestige,
      rosterIds: athletes.map((a) => a.id),
      coachName: coach.full,
    },
    athletes,
  };
}

export function generateLeagueTeams(rng: RNG, level: Level, names: NameBook = new NameBook()): { teams: Team[]; athletes: Athlete[] } {
  const teams: Team[] = [];
  const athletes: Athlete[] = [];
  for (const tpl of TEAMS_BY_LEVEL[level]) {
    const r = generateTeam(rng, level, tpl, names);
    teams.push(r.team);
    athletes.push(...r.athletes);
  }
  return { teams, athletes };
}

export function baseRelationship(over: Partial<Relationship> = {}): Relationship {
  return { affinity: 0, respect: 30, trust: 30, rivalry: 0, romance: 0, ...over };
}

export function makeNpc(
  rng: RNG,
  p: {
    name: string;
    role: NpcRole;
    title: string;
    season: number;
    athleteId?: string;
    personality?: string[];
    rel?: Partial<Relationship>;
    memories?: string[];
    /** A profile id to use, or null for none. Left out, coaches, rivals, teammates and friends get one drawn for them. */
    profile?: string | null;
    /** The level they are met at, which makes some profiles likelier than others. */
    level?: Level;
  },
): Npc {
  // someone the narrator invented arrives with its own personality, and is left as it made them
  const prof = p.profile === null ? undefined : p.profile ? profileById(p.profile) : PROFILED_ROLES.includes(p.role) ? pickProfile(rng, p.role, p.level) : undefined;
  const personality = p.personality ?? prof?.traits ?? rng.shuffle([...PERSONALITIES]).slice(0, 2);
  const rel = baseRelationship(p.rel);
  // a profile shifts however the relationship would have started
  if (prof) for (const [k, d] of Object.entries(prof.rel) as [keyof Relationship, number][]) rel[k] = k === 'affinity' ? clamp(rel[k] + d, -100, 100) : clamp(rel[k] + d, 0, 100);
  return {
    id: rng.id('npc'),
    name: p.name,
    role: p.role,
    profile: prof?.id ?? '',
    stage: 0,
    title: p.title,
    personality,
    athleteId: p.athleteId,
    relationship: rel,
    memories: p.memories ?? (prof?.memory ? [prof.memory] : []),
    keyMemories: [],
    estranged: false,
    h2h: { w: 0, l: 0 },
    active: true,
    metSeason: p.season,
  };
}
