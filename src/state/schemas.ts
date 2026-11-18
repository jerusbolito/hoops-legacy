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
  /** A senior's announced college, so they turn up there when the class moves on. */
  committedTo: z.string().optional(),
  /** Pros only: seasons left on their deal. Set the first time the league's contracts roll over. */
  contractYears: z.number().optional(),
  /** Pros only: what they are paid a year. Set along with the length of the deal. */
  salary: z.number().optional(),
  /** Their last finished season at this level, for the player card. */
  prev: z
    .object({ season: z.number(), team: z.string(), gp: z.number(), mpg: z.number(), ppg: z.number(), rpg: z.number(), apg: z.number(), spg: z.number(), bpg: z.number(), fgPct: z.number(), tpPct: z.number(), ftPct: z.number() })
    .optional(),
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

/** How a story athlete (rival, friend, teammate) did last season, so they can be written about as people who move on. */
export const NpcSeasonSchema = z.object({
  season: z.number(),
  teamName: z.string(),
  gp: z.number(),
  ppg: z.number(),
  rpg: z.number(),
  apg: z.number(),
  mpg: z.number(),
  /** Where they ranked on their own team by rating (1 = best). */
  rank: z.number(),
});
export type NpcSeason = z.infer<typeof NpcSeasonSchema>;

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
  /** Defining moments with this character. Pinned: they never get pushed out by newer small talk. */
  keyMemories: z.array(z.string()).default([]),
  /** Not speaking to the player after a falling out. Cleared by repairing the relationship. */
  estranged: z.boolean().default(false),
  active: z.boolean(),
  metSeason: z.number(),
  /** Last finished season, for athletes who play. Updated at every season turn. */
  lastSeason: NpcSeasonSchema.optional(),
  /** Your record against this person's team in games they played in. */
  h2h: z.object({ w: z.number(), l: z.number() }).default({ w: 0, l: 0 }),
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
  /** The user's field-goal attempts: court position (same space as PlayEvent.shot) and whether it went in. */
  shots: z.array(z.object({ x: z.number(), y: z.number(), m: z.boolean() })).default([]),
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

/** An endorsement / NIL deal the player has signed. */
export const DealSchema = z.object({
  id: z.string(),
  brand: z.string(),
  category: z.string(),
  perSeason: z.number(),
  yearsLeft: z.number(),
  /** Energy it costs each week (appearances, shoots). */
  energy: z.number(),
  /** Pays more but can blow up on you. */
  sketchy: z.boolean(),
  /** Share of the money the agent or family adviser takes. */
  commission: z.number(),
  signedSeason: z.number(),
});
export type Deal = z.infer<typeof DealSchema>;

export const OfferSchema = z.object({
  id: z.string(),
  brand: z.string(),
  category: z.string(),
  perSeason: z.number(),
  years: z.number(),
  energy: z.number(),
  sketchy: z.boolean(),
  commission: z.number(),
  pitch: z.string(),
  /** What your adviser says about it (honest or not, depending on who they are). */
  advice: z.string(),
  expiresSeason: z.number(),
  expiresWeek: z.number(),
});
export type Offer = z.infer<typeof OfferSchema>;

/** Where the money went and came from over one season. */
export const FinanceLineSchema = z.object({
  /** Everything earned before taxes: salary, stipend, endorsements. */
  earned: z.number().default(0),
  /** The part of `earned` that came from endorsements, after the agent's cut. */
  endorse: z.number().default(0),
  taxes: z.number().default(0),
  living: z.number().default(0),
  /** Trainers, recovery and the like. */
  services: z.number().default(0),
  /** Everything else you chose to spend on (events, family, camps). */
  spent: z.number().default(0),
  /** Windfalls and gifts. */
  gifts: z.number().default(0),
});
export type FinanceLine = z.infer<typeof FinanceLineSchema>;

export const FinanceSchema = FinanceLineSchema.extend({
  season: z.number().default(0),
  prev: FinanceLineSchema.nullable().default(null),
});
export type Finance = z.infer<typeof FinanceSchema>;

export const ServiceIdSchema = z.enum(['trainer', 'recovery', 'nutrition', 'tutor', 'agency']);
export type ServiceId = z.infer<typeof ServiceIdSchema>;

export const PostSchema = z.object({
  id: z.number(),
  season: z.number(),
  week: z.number(),
  kind: z.string(),
  author: z.string(),
  handle: z.string(),
  text: z.string(),
  likes: z.number(),
});
export type Post = z.infer<typeof PostSchema>;

export const PlanIdSchema = z.enum(['balanced', 'attack_rim', 'perimeter', 'playmaker', 'lockdown', 'conserve']);
export type PlanId = z.infer<typeof PlanIdSchema>;

export const PressSchema = z.object({
  id: z.string(),
  kind: z.string(),
  question: z.string(),
  /** Facts the question was built from, for display. */
  context: z.string(),
  rival: z.boolean().default(false),
});
export type Press = z.infer<typeof PressSchema>;

/* Where the player comes from and why they play. Chosen at creation; it shapes money, training, relationships, events and the story. */
export const BackgroundSchema = z.enum(['struggling', 'working', 'comfortable', 'athletic', 'wealthy']);
export type Background = z.infer<typeof BackgroundSchema>;
export const MotiveSchema = z.enum(['prove', 'provide', 'love', 'fame', 'legacy']);
export type Motive = z.infer<typeof MotiveSchema>;
export const TemperamentSchema = z.enum(['steady', 'fiery', 'loyal', 'charming', 'loner']);
export type Temperament = z.infer<typeof TemperamentSchema>;
export const BuildSchema = z.enum(['lean', 'balanced', 'strong']);
export type Build = z.infer<typeof BuildSchema>;

export const OriginSchema = z.object({
  /** False for saves from before this existed: they play exactly as they always did. */
  chosen: z.boolean().default(false),
  background: BackgroundSchema.default('working'),
  motive: MotiveSchema.default('love'),
  temperament: TemperamentSchema.default('steady'),
  /** How the player looks. Skin and hair are indexes into the portrait palettes. */
  look: z
    .object({
      skin: z.number().default(3),
      hair: z.number().default(0),
      style: z.string().default('short'),
      build: BuildSchema.default('balanced'),
      number: z.number().default(1),
    })
    .default({}),
});
export type Origin = z.infer<typeof OriginSchema>;

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
  injury: z.object({ weeks: z.number(), desc: z.string(), /** How long it was at the start, for the comeback. */ total: z.number().optional(), /** Rehab sessions toward shaving off a week. */ rehab: z.number().optional() }).nullable(),
  /** fractional training progress per rating, flushes into ratings at >= 1 */
  progress: z.record(z.number()),
  contract: ContractSchema.nullable(),
  awards: z.array(AwardSchema),
  draftPick: z.number().nullable(),
  collegeId: z.string().nullable(),
  /** Unlocked signature moves and badges (ids from engine/badges). */
  badges: z.array(z.string()).default([]),
  deals: z.array(DealSchema).default([]),
  /** How many times injuries have hit; a long history makes you injury-prone. */
  injuryHistory: z.number().default(0),
  /** Clutch moments won, for the Closer badge. */
  clutchWins: z.number().default(0),
  /** Draft-stock bonus from the combine; spent when the draft runs. */
  draftBoost: z.number().default(0),
  /** Events already played, as "season:eventId". */
  eventsDone: z.array(z.string()).default([]),
  /** Paid-for help (trainer, recovery team...). Each works through the end of season `until`. */
  services: z.array(z.object({ id: ServiceIdSchema, until: z.number() })).default([]),
  finance: FinanceSchema.default({}),
  origin: OriginSchema.default({}),
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

/** A random moment waiting for the player to decide. The text and options are rebuilt from the id, the seed and the people it names. */
export const LifeEventSchema = z.object({
  id: z.string(),
  seed: z.number(),
  /** People and places the event is about, by role (coach, friend, rival, teammate, family, love, opp). */
  refs: z.record(z.string()).default({}),
});
export type LifeEventPending = z.infer<typeof LifeEventSchema>;

/** A school or team that wants the player, while they decide whether to leave. */
export const MoveOfferSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  mascot: z.string(),
  abbrev: z.string(),
  colors: z.tuple([z.string(), z.string()]),
  prestige: z.number(),
  coachName: z.string(),
  /** Where the player would sit on that roster (1 = best). */
  rank: z.number(),
  role: z.string(),
  /** One-time money a college collective puts up to land you. */
  nil: z.number().default(0),
  pitch: z.string(),
});
export type MoveOffer = z.infer<typeof MoveOfferSchema>;

export const PendingMoveSchema = z.object({ kind: z.enum(['transfer', 'trade']), offers: z.array(MoveOfferSchema), headline: z.string().default('') });
export type PendingMove = z.infer<typeof PendingMoveSchema>;

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
  /** Game plan chosen for the next game, and whether you spent the day on film. Cleared after the game. */
  plan: z.object({ id: PlanIdSchema, film: z.boolean() }).nullable().default(null),
  /** Playing through a minor injury in the next game. Cleared after the game. */
  playHurt: z.boolean().default(false),
  /** A press question waiting for an answer. */
  press: PressSchema.nullable().default(null),
  /** Games since the last press question, so they stay rare. */
  gamesSincePress: z.number().default(0),
  /** A random moment waiting for a decision. */
  lifeEvent: LifeEventSchema.nullable().default(null),
  /** The last few random moments, so the same one does not come around again right away. */
  recentLife: z.array(z.string()).default([]),
  weeksSinceLife: z.number().default(0),
  /** How well the locker room gets along, 0 to 100. It nudges every teammate's play. */
  chemistry: z.number().default(55),
  /** Season in which the player last opened the transfer portal or asked for a trade. One try per season. */
  moveSeason: z.number().default(0),
  /** Teams that want the player right now, until they pick one or stay. */
  pendingMove: PendingMoveSchema.nullable().default(null),
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
  /** Rolling ~150-word summary of the whole career so far, rewritten at every season end. */
  careerSummary: z.string().default(''),
  /** Pinned defining moments the narrator must stay consistent with. */
  defining: z.array(z.object({ season: z.number(), text: z.string() })).default([]),
  /** Unresolved hooks from the latest scenes, to pay off in the next ones. */
  threads: z.array(z.string()).default([]),
  /** Past choices that will come back to matter. Pending until their season, then due until played out. */
  ripples: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        npcId: z.string().optional(),
        openedSeason: z.number(),
        dueSeason: z.number(),
        status: z.enum(['pending', 'due', 'resolved']),
      }),
    )
    .default([]),
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
  z.object({ type: z.literal('memory'), npc: z.string(), text: z.string(), important: z.boolean().optional() }),
  z.object({ type: z.literal('moment'), text: z.string() }),
  z.object({ type: z.literal('ripple'), text: z.string(), seasons: z.number().optional(), npc: z.string().optional() }),
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
  // the rest arrived later; older saves count from zero
  fgm: z.number().default(0),
  fga: z.number().default(0),
  tpm: z.number().default(0),
  tpa: z.number().default(0),
  ftm: z.number().default(0),
  fta: z.number().default(0),
  orb: z.number().default(0),
  drb: z.number().default(0),
  tov: z.number().default(0),
  pf: z.number().default(0),
});
export type LeagueStatLine = z.infer<typeof LeagueStatLineSchema>;

/** One line in a league record book: a night or a season, and who did it. */
export const RecordEntrySchema = z.object({
  athleteId: z.string(),
  name: z.string(),
  team: z.string(),
  /** Who the night was against (games only). */
  opp: z.string().default(''),
  season: z.number(),
  level: LevelSchema,
  value: z.number(),
  /** Games played, for season averages. */
  gp: z.number().default(0),
  /** Set by the player's own career (the family's, in later generations). */
  user: z.boolean().default(false),
});
export type RecordEntry = z.infer<typeof RecordEntrySchema>;

/** One accolade in a league's history: who won what, in which season. Kept for every league the player passes through. */
export const HonorKindSchema = z.enum(['champion', 'mvp', 'dpoy', 'first', 'second', 'allstar']);
export type HonorKind = z.infer<typeof HonorKindSchema>;
export const HonorSchema = z.object({
  season: z.number(),
  level: LevelSchema,
  kind: HonorKindSchema,
  /** Empty for a team honor (the champion). */
  athleteId: z.string().default(''),
  name: z.string(),
  team: z.string().default(''),
  /** A short line of production, such as "20.8 ppg". */
  stat: z.string().default(''),
  user: z.boolean().default(false),
});
export type Honor = z.infer<typeof HonorSchema>;

/* ───────────────────────── The week, and the paper ───────────────────────── */

/** One player's night, kept until the week's paper is printed. */
export const WeekLineSchema = z.object({
  id: z.string(),
  t: z.string(),
  o: z.string(),
  ts: z.number(),
  os: z.number(),
  min: z.number(),
  pts: z.number(),
  reb: z.number(),
  ast: z.number(),
  stl: z.number(),
  blk: z.number(),
  fgm: z.number(),
  fga: z.number(),
  tpm: z.number(),
  tpa: z.number(),
  tov: z.number(),
  gs: z.number(),
});
export type WeekLine = z.infer<typeof WeekLineSchema>;

/** A piece of text with the people in it, so a screen can make their names clickable. */
export const PaperItemSchema = z.object({ text: z.string(), people: z.array(z.object({ id: z.string(), name: z.string() })).default([]) });
export type PaperItem = z.infer<typeof PaperItemSchema>;

export const IssueSchema = z.object({
  id: z.number(),
  kind: z.enum(['preview', 'weekly', 'playoffs', 'recap']),
  season: z.number(),
  week: z.number(),
  masthead: z.string(),
  dateline: z.string(),
  headline: z.string(),
  deck: z.string(),
  lead: z.array(PaperItemSchema),
  sections: z.array(z.object({ id: z.string(), title: z.string(), items: z.array(PaperItemSchema) })),
  scoreboard: z.array(z.object({ away: z.string(), home: z.string(), as: z.number(), hs: z.number(), you: z.boolean(), round: z.string().optional() })).default([]),
  standings: z.array(z.object({ team: z.string(), w: z.number(), l: z.number(), you: z.boolean(), move: z.number() })).default([]),
  leaders: z.array(z.object({ label: z.string(), rows: z.array(z.object({ id: z.string(), name: z.string(), team: z.string(), value: z.string() })) })).default([]),
});
export type Issue = z.infer<typeof IssueSchema>;

/* ───────────────────────── Recruiting ───────────────────────── */

/** A school or team that is interested in the player. */
export const SuitorSchema = z.object({ name: z.string(), interest: z.number(), contacts: z.number().default(0), visited: z.boolean().default(false) });
export type Suitor = z.infer<typeof SuitorSchema>;

/** A player the user is trying to convince to join their team. */
export const RecruitTargetSchema = z.object({
  athleteId: z.string(),
  name: z.string(),
  position: z.string(),
  fromTeam: z.string(),
  /** How sold they are on the user's team, 0 to 100. */
  pull: z.number(),
  contacts: z.number().default(0),
  /** Other teams chasing the same player. */
  rivals: z.array(z.object({ teamId: z.string(), pull: z.number() })),
  note: z.string().default(''),
  arcId: z.string().optional(),
});
export type RecruitTarget = z.infer<typeof RecruitTargetSchema>;

export const RecruitResultSchema = z.object({ season: z.number(), name: z.string(), outcome: z.enum(['signed', 'lost', 'stayed']), team: z.string(), text: z.string() });
export type RecruitResult = z.infer<typeof RecruitResultSchema>;

export const RecruitingSchema = z.object({
  /** Recruiting actions in hand. One more arrives each week, up to a cap. */
  points: z.number().default(2),
  suitors: z.array(SuitorSchema).default([]),
  targets: z.array(RecruitTargetSchema).default([]),
  history: z.array(RecruitResultSchema).default([]),
});
export type Recruiting = z.infer<typeof RecruitingSchema>;

/* ───────────────────────── Legacy: legends, goals, family ───────────────────────── */

/** One finished career, as it is remembered in the Hall of Fame and on the family tree. */
export const LegendSchema = z.object({
  /** `${saveId}:${generation}`, so filing the same career twice only ever writes one row. */
  id: z.string(),
  saveId: z.string(),
  generation: z.number().default(1),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  hometown: z.string().default(''),
  position: z.string().default(''),
  firstSeason: z.number().default(1),
  lastSeason: z.number().default(1),
  seasons: z.number().default(0),
  peakOverall: z.number().default(0),
  /** Hall of Fame score and the tier it earns (0 = Journeyman ... 5 = Immortal). */
  score: z.number().default(0),
  tier: z.number().default(0),
  tierLabel: z.string().default(''),
  titles: z.number().default(0),
  mvps: z.number().default(0),
  allStars: z.number().default(0),
  honors: z.number().default(0),
  gp: z.number().default(0),
  ppg: z.number().default(0),
  rpg: z.number().default(0),
  apg: z.number().default(0),
  proGp: z.number().default(0),
  proPpg: z.number().default(0),
  earnings: z.number().default(0),
  kids: z.number().default(0),
  married: z.boolean().default(false),
  draftPick: z.number().nullable().default(null),
  badges: z.number().default(0),
  goalsDone: z.number().default(0),
  goalsTotal: z.number().default(0),
  /** Name of the parent or mentor this career grew out of, if any. */
  parent: z.string().default(''),
  /** The challenge this career was a run of, if any (see engine/challenges.ts). */
  challenge: z.string().default(''),
  /** The teams they played for as a pro. */
  teams: z.array(z.string()).default([]),
  summary: z.string().default(''),
  retiredAt: z.number().default(0),
});
export type Legend = z.infer<typeof LegendSchema>;

/** A long-term target for the career. What counts as done is worked out by `engine/goals.ts`. */
export const GoalSchema = z.object({
  id: z.string(),
  kind: z.string(),
  /** The number to reach, for goals that have one. */
  target: z.number().default(0),
  /** Season it was reached in, or 0 while still open. */
  doneSeason: z.number().default(0),
  /** Season it was set in. */
  setSeason: z.number().default(1),
});
export type Goal = z.infer<typeof GoalSchema>;

export const LegacySchema = z.object({
  /** 1 is the first player. Each heir is the next generation. */
  generation: z.number().default(1),
  /** The family surname that carries on, empty until a first career retires. */
  family: z.string().default(''),
  /** The fame (0 to 5) the current player was born into. */
  inherited: z.number().default(0),
  relation: z.enum(['none', 'child', 'protege']).default('none'),
  /** Full name of the parent or mentor of the current player. */
  parent: z.string().default(''),
  /** Careers that came before, oldest first. */
  lineage: z.array(LegendSchema).default([]),
});
export type Legacy = z.infer<typeof LegacySchema>;

/* ───────────────────────── Coaching: the career after the career ───────────────────────── */

export const CoachSeasonSchema = z.object({
  season: z.number(),
  teamId: z.string(),
  teamName: z.string(),
  w: z.number(),
  l: z.number(),
  result: z.enum(['champion', 'finalist', 'playoffs', 'missed']),
  /** Reputation after the season. */
  rep: z.number().default(0),
  fired: z.boolean().default(false),
});
export type CoachSeason = z.infer<typeof CoachSeasonSchema>;

export const CoachingSchema = z.object({
  active: z.boolean().default(false),
  /** Where the coach is in the yearly loop. */
  stage: z.enum(['offers', 'offseason', 'review']).default('offers'),
  teamId: z.string().default(''),
  philosophy: z.enum(['win_now', 'balanced', 'develop']).default('balanced'),
  /** The skill the staff drills with the whole roster. */
  focus: z.enum(RATING_KEYS).default('shooting'),
  /** 0..100. Climbs with wins and titles, falls with losing; low means a pink slip. */
  rep: z.number().default(40),
  offers: z.array(z.string()).default([]),
  history: z.array(CoachSeasonSchema).default([]),
});
export type Coaching = z.infer<typeof CoachingSchema>;

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
  /** Social media posts about the player, newest last. */
  feed: z.array(PostSchema).default([]),
  /** Endorsement offers waiting for an answer. */
  offers: z.array(OfferSchema).default([]),
  /** Every player's line from this week's games, until the week's paper is printed. */
  weekLog: z.object({ lines: z.array(WeekLineSchema).default([]) }).default({}),
  /** The newspaper, newest last. */
  paper: z.array(IssueSchema).default([]),
  /** Who is recruiting you, and who you are recruiting. */
  recruiting: RecruitingSchema.default({}),
  /** Who moved where around the league, newest last. */
  transactions: z.array(z.object({ season: z.number(), week: z.number(), kind: z.enum(['transfer', 'trade', 'signing', 'coach', 'recruit', 'draft']), text: z.string() })).default([]),
  /** Family and the careers that came before this one. */
  legacy: LegacySchema.default({}),
  /** The long-term targets the current career is chasing. */
  goals: z.array(GoalSchema).default([]),
  /** Top-10 record books, keyed "game:hs:pts", "season:college:ppg" and so on. */
  records: z.record(z.array(RecordEntrySchema)).default({}),
  /** League-wide accolades by season: champions, MVPs, All-League and All-Star teams. */
  honors: z.array(HonorSchema).default([]),
  /** The coaching career, once a retired player takes a job (see engine/coaching.ts). */
  coaching: CoachingSchema.default({}),
});
export type GameState = z.infer<typeof GameStateSchema>;
