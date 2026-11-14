import { z } from 'zod';

/* ───────────────────────── Ratings & athletes ───────────────────────── */

export const RATING_KEYS = [
  'shooting',
  'finishing',
  'handles',
  'passing',
  'defense',
  'rebounding',
  'athleticism',
  'iq',
  'stamina',
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const RATING_LABELS: Record<RatingKey, string> = {
  shooting: 'SHT',
  finishing: 'FIN',
  handles: 'HND',
  passing: 'PAS',
  defense: 'DEF',
  rebounding: 'REB',
  athleticism: 'ATH',
  iq: 'IQ',
  stamina: 'STM',
};

export const RatingsSchema = z.object(
  Object.fromEntries(RATING_KEYS.map((k) => [k, z.number().min(0).max(99)])) as Record<
    RatingKey,
    z.ZodNumber
  >,
);
export type Ratings = z.infer<typeof RatingsSchema>;

export const PositionSchema = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export type Position = z.infer<typeof PositionSchema>;

export const ArchetypeSchema = z.enum(['slasher', 'sharpshooter', 'playmaker', 'big', 'two-way']);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const LevelSchema = z.enum(['hs', 'college', 'pro']);
export type Level = z.infer<typeof LevelSchema>;

export const AthleteSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  position: PositionSchema,
  archetype: ArchetypeSchema,
  heightIn: z.number(),
  age: z.number(),
  ratings: RatingsSchema,
  potential: z.number(),
  teamId: z.string().nullable(),
  /** Persistent athletes (user, rivals, friends) survive level transitions. */
  persistent: z.boolean().default(false),
});
export type Athlete = z.infer<typeof AthleteSchema>;

/* ───────────────────────── NPCs & relationships ───────────────────────── */

export const NpcRoleSchema = z.enum([
  'teammate',
  'rival',
  'coach',
  'family',
  'friend',
  'love_interest',
  'agent',
  'media',
  'scout',
  'mentor',
  'other',
]);
export type NpcRole = z.infer<typeof NpcRoleSchema>;

export const REL_FIELDS = ['affinity', 'respect', 'trust', 'rivalry', 'romance'] as const;
export type RelField = (typeof REL_FIELDS)[number];

export const RelationshipSchema = z.object({
  affinity: z.number(), // -100..100
  respect: z.number(), // 0..100
  trust: z.number(), // 0..100
  rivalry: z.number(), // 0..100
  romance: z.number(), // 0..100
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: NpcRoleSchema,
  /** Short descriptor e.g. "Head coach, Westbrook High" */
  title: z.string(),
  personality: z.array(z.string()),
  athleteId: z.string().optional(),
  relationship: RelationshipSchema,
  memories: z.array(z.string()),
  active: z.boolean(),
  metSeason: z.number(),
});
export type Npc = z.infer<typeof NpcSchema>;

/* ───────────────────────── Teams, leagues, games ───────────────────────── */

export const TeamSchema = z.object({
  id: z.string(),
  level: LevelSchema,
  name: z.string(),
  mascot: z.string(),
  abbrev: z.string(),
  colors: z.tuple([z.string(), z.string()]),
  prestige: z.number(), // 0..100
  rosterIds: z.array(z.string()),
  coachName: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;

export const PlayerLineSchema = z.object({
  athleteId: z.string(),
  sec: z.number(),
  pts: z.number(),
  fgm: z.number(),
  fga: z.number(),
  tpm: z.number(),
  tpa: z.number(),
  ftm: z.number(),
  fta: z.number(),
  orb: z.number(),
  drb: z.number(),
  ast: z.number(),
  stl: z.number(),
  blk: z.number(),
  tov: z.number(),
  pf: z.number(),
});
export type PlayerLine = z.infer<typeof PlayerLineSchema>;

export const TeamBoxSchema = z.object({
  teamId: z.string(),
  score: z.number(),
  quarters: z.array(z.number()),
  players: z.array(PlayerLineSchema),
});
export type TeamBox = z.infer<typeof TeamBoxSchema>;

export const BoxScoreSchema = z.object({
  home: TeamBoxSchema,
  away: TeamBoxSchema,
});
export type BoxScore = z.infer<typeof BoxScoreSchema>;

export const ScheduledGameSchema = z.object({
  id: z.string(),
  week: z.number(),
  homeId: z.string(),
  awayId: z.string(),
  playoffRound: z.number().optional(),
  played: z.boolean(),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
});
export type ScheduledGame = z.infer<typeof ScheduledGameSchema>;

export const StandingSchema = z.object({ w: z.number(), l: z.number(), pf: z.number(), pa: z.number() });
export type Standing = z.infer<typeof StandingSchema>;

export const LeagueSchema = z.object({
  level: LevelSchema,
  name: z.string(),
  teamIds: z.array(z.string()),
  schedule: z.array(ScheduledGameSchema),
  standings: z.record(StandingSchema),
  regularWeeks: z.number(),
  playoffTeams: z.number(),
  champion: z.string().nullable(),
});
export type League = z.infer<typeof LeagueSchema>;

/* ───────────────────────── Player career ───────────────────────── */

export const GameLogEntrySchema = z.object({
  gameId: z.string(),
  season: z.number(),
  level: LevelSchema,
  year: z.number(),
  week: z.number(),
  teamId: z.string(),
  oppId: z.string(),
  teamScore: z.number(),
  oppScore: z.number(),
  playoff: z.boolean(),
  line: PlayerLineSchema,
});
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;

export const AwardSchema = z.object({ season: z.number(), level: LevelSchema, name: z.string() });
export type Award = z.infer<typeof AwardSchema>;

export const ContractSchema = z.object({
  teamId: z.string(),
  salary: z.number(), // per season, in $
  yearsLeft: z.number(),
});
export type Contract = z.infer<typeof ContractSchema>;

export const PlayerSchema = z.object({
  athleteId: z.string(),
  hometown: z.string(),
  traits: z.array(z.string()),
  morale: z.number(), // 0..100
  energy: z.number(), // 0..100
  academics: z.number(), // GPA 0..4
  money: z.number(),
  reputation: z.number(), // 0..100
  followers: z.number(),
  injury: z.object({ weeks: z.number(), desc: z.string() }).nullable(),
  /** fractional training progress per rating, flushes into ratings at >= 1 */
  progress: z.record(z.number()),
  contract: ContractSchema.nullable(),
  awards: z.array(AwardSchema),
  draftPick: z.number().nullable(),
  collegeId: z.string().nullable(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const PhaseSchema = z.enum([
  'preseason',
  'regular',
  'playoffs',
  'offseason',
  'recruiting',
  'draft',
  'free_agency',
  'retired',
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const WeekStepSchema = z.enum(['training', 'scene', 'game', 'done']);
export type WeekStep = z.infer<typeof WeekStepSchema>;

export const CareerSchema = z.object({
  level: LevelSchema,
  /** Year within the level (HS 1-4 = Fr..Sr, college 1-4, pro 1..n) */
  year: z.number(),
  /** Global season counter across the whole career */
  season: z.number(),
  phase: PhaseSchema,
  week: z.number(),
  step: WeekStepSchema,
  teamId: z.string(),
  calendarYear: z.number(),
});
export type Career = z.infer<typeof CareerSchema>;

/* ───────────────────────── Story ───────────────────────── */

export const StoryEntrySchema = z.object({
  season: z.number(),
  week: z.number(),
  phase: PhaseSchema,
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
});
export type StoryEntry = z.infer<typeof StoryEntrySchema>;

export const ArcSchema = z.object({
  id: z.string(),
  title: z.string(),
  stakes: z.string(),
  npcIds: z.array(z.string()),
  openedSeason: z.number(),
  status: z.enum(['open', 'resolved']),
  outcome: z.string().optional(),
});
export type Arc = z.infer<typeof ArcSchema>;

export const StorySchema = z.object({
  log: z.array(StoryEntrySchema),
  seasonSummaries: z.array(z.object({ season: z.number(), text: z.string() })),
  flags: z.record(z.union([z.string(), z.number(), z.boolean()])),
  arcs: z.array(ArcSchema),
});
export type Story = z.infer<typeof StorySchema>;

/* ───────────────────────── Effects ───────────────────────── */

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rel'), npc: z.string(), field: z.enum(REL_FIELDS), delta: z.number() }),
  z.object({ type: z.literal('morale'), delta: z.number() }),
  z.object({ type: z.literal('energy'), delta: z.number() }),
  z.object({ type: z.literal('rating'), key: z.enum(RATING_KEYS), delta: z.number() }),
  z.object({ type: z.literal('reputation'), delta: z.number() }),
  z.object({ type: z.literal('followers'), delta: z.number() }),
  z.object({ type: z.literal('money'), delta: z.number() }),
  z.object({ type: z.literal('academics'), delta: z.number() }),
  z.object({ type: z.literal('flag'), key: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ type: z.literal('memory'), npc: z.string(), text: z.string() }),
  z.object({
    type: z.literal('npc_new'),
    name: z.string(),
    role: NpcRoleSchema,
    title: z.string(),
    personality: z.array(z.string()).default([]),
  }),
  z.object({ type: z.literal('arc_open'), title: z.string(), stakes: z.string(), npcs: z.array(z.string()).default([]) }),
  z.object({ type: z.literal('arc_close'), id: z.string(), outcome: z.string() }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const EffectLogEntrySchema = z.object({
  season: z.number(),
  week: z.number(),
  source: z.string(),
  text: z.string(),
});
export type EffectLogEntry = z.infer<typeof EffectLogEntrySchema>;

/** Lightweight per-athlete season totals for the whole league (leaderboards, awards). */
export const LeagueStatLineSchema = z.object({
  gp: z.number(),
  min: z.number(),
  pts: z.number(),
  reb: z.number(),
  ast: z.number(),
  stl: z.number(),
  blk: z.number(),
});
export type LeagueStatLine = z.infer<typeof LeagueStatLineSchema>;

/* ───────────────────────── Root state ───────────────────────── */

export const SAVE_VERSION = 1;

export const GameStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  rngState: z.number(),
  player: PlayerSchema,
  athletes: z.record(AthleteSchema),
  npcs: z.record(NpcSchema),
  teams: z.record(TeamSchema),
  league: LeagueSchema,
  career: CareerSchema,
  gameLog: z.array(GameLogEntrySchema),
  leagueStats: z.record(LeagueStatLineSchema),
  /** Box score of the user's most recent game only (older ones live as GameLogEntry lines). */
  lastBox: z.object({ gameId: z.string(), box: BoxScoreSchema }).nullable(),
  story: StorySchema,
  news: z.array(z.object({ season: z.number(), week: z.number(), text: z.string() })),
  effectLog: z.array(EffectLogEntrySchema),
});
export type GameState = z.infer<typeof GameStateSchema>;
