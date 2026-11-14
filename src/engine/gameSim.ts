import type { Athlete, BoxScore, PlayerLine, RatingKey, TeamBox } from '../state/schemas';
import { RNG, clamp } from './rng';
import { overall, shortName } from './ratings';
import { RECENT_SHOTS, playerIntel, teamQuick, tipsFor, type Edge, type MomentIntel, type PlayerIntel } from './intel';
import { RATING_KEYS } from '../state/schemas';

/* ───────────────────────── Types ───────────────────────── */

export type Side = 'home' | 'away';
type ShotType = 'rim' | 'mid' | 'three';

export interface SimTeamInput {
  teamId: string;
  abbrev: string;
  roster: Athlete[];
}

export interface SimOptions {
  quarterMinutes: number;
  /** Mean rating for this level; shot odds are relative to it. */
  levelMean: number;
  foulOut: number;
  /** Possession length multiplier (<1 = faster). */
  pace?: number;
  keyMoments: boolean;
  userAthleteId?: string;
  /** Additive rating modifiers (energy, morale, injury) by athlete id. */
  ratingMods?: Record<string, number>;
  /** Athletes on the other side flagged as rivals (key moments target them). */
  rivalIds?: string[];
  /** Traits of the user (e.g. "clutch") that shade key-moment odds. */
  userTraits?: string[];
  /** Game plan, badges and coach standing for the user. */
  userMods?: UserMods;
}

export interface PlayEvent {
  quarter: number;
  clock: number;
  side: Side;
  text: string;
  home: number;
  away: number;
  user?: boolean;
  scoring?: boolean;
  /** Court coordinates for shot chart, 0..1 (x across, y from the basket). */
  shot?: { x: number; y: number; made: boolean; user: boolean };
}

export type ShotKind = 'rim' | 'mid' | 'three';

/** An extra option the player has earned (a badge), offered on key moments. */
export interface SignatureMove {
  id: string;
  label: string;
  detail: string;
  kind: 'offense' | 'defense';
  /** Offense: the kind of shot it is. */
  shot?: ShotKind;
  /** Defense: which basic action it upgrades. */
  base?: 'steal' | 'solid' | 'block';
  /** Added to the option's odds. */
  bonus: number;
  rating: RatingKey;
  win: string;
  lose: string;
}

/**
 * Everything that tilts the user's game: the game plan, film study, earned badges and the coach's trust.
 * Built by engine/userMods from the save; the simulator only reads it.
 */
export interface UserMods {
  /** Added to the user's own shot odds, by shot type. */
  shot: { rim: number; mid: number; three: number };
  pass: number;
  steal: number;
  solid: number;
  block: number;
  /** Extra odds on every option in a clutch moment. */
  clutch: number;
  /** Added to every one of the user's shots and moment options (film study). */
  all: number;
  /** Added to the user's rating when ranking players for the lineup, so a trusted player starts. */
  rankBoost: number;
  /** Scales the user's share of minutes, -0.25 to +0.25. */
  minutesBias: number;
  signatures: SignatureMove[];
}

export const NO_MODS: UserMods = { shot: { rim: 0, mid: 0, three: 0 }, pass: 0, steal: 0, solid: 0, block: 0, clutch: 0, all: 0, rankBoost: 0, minutesBias: 0, signatures: [] };

export interface MomentOption {
  id: string;
  label: string;
  detail: string;
  odds: number;
  rating: RatingKey;
  /** The ratings that decide this option: yours against theirs. */
  edge?: Edge;
  /** An earned badge move, not one of the basic options. */
  signature?: boolean;
}

export interface KeyMoment {
  id: string;
  kind: 'offense' | 'defense';
  clutch: boolean;
  quarter: number;
  clock: number;
  homeScore: number;
  awayScore: number;
  situation: string;
  opponentName?: string;
  opponentId?: string;
  isRival: boolean;
  options: MomentOption[];
  /** Scouting report for the decision. Absent only on moments created by older code. */
  intel?: MomentIntel;
}

export interface MomentResult {
  momentId: string;
  optionId: string;
  optionLabel: string;
  success: boolean;
  roll: number;
  odds: number;
  text: string;
  clutch: boolean;
  quarter: number;
  clock: number;
  margin: number;
}

export type SimStatus = { type: 'moment'; moment: KeyMoment } | { type: 'final' };

/* ───────────────────────── Helpers ───────────────────────── */

function emptyLine(athleteId: string): PlayerLine {
  return {
    athleteId,
    sec: 0,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    orb: 0,
    drb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
  };
}

export const MINUTE_SHARE = [0.82, 0.78, 0.75, 0.72, 0.68, 0.45, 0.38, 0.28, 0.14, 0.06, 0.04, 0.03, 0.02];
const SEGMENTS_PER_Q = 4;

interface SideState {
  input: SimTeamInput;
  /** roster sorted by overall desc, excluding none */
  roster: Athlete[];
  onCourt: Athlete[];
  lines: Map<string, PlayerLine>;
  quarters: number[];
  score: number;
  share: Map<string, number>;
}

/* ───────────────────────── Simulator ───────────────────────── */

export class GameSim {
  readonly rng: RNG;
  readonly opts: SimOptions;
  readonly sides: Record<Side, SideState>;
  readonly quarterSec: number;

  quarter = 1;
  clock: number;
  possession: Side;
  elapsedInGame = 0;
  final = false;
  feed: PlayEvent[] = [];
  momentResults: MomentResult[] = [];
  pending: KeyMoment | null = null;

  private segment = -1;
  private momentPlan: { quarter: number; atClock: number; fired: boolean }[] = [];
  private clutchFired = 0;
  private userSide: Side | null = null;
  private momentSeq = 0;
  /** Each player's most recent field-goal results, for hot/cold hands. */
  private recentShots = new Map<string, boolean[]>();

  constructor(rng: RNG, home: SimTeamInput, away: SimTeamInput, opts: SimOptions) {
    this.rng = rng;
    this.opts = opts;
    this.quarterSec = opts.quarterMinutes * 60;
    this.clock = this.quarterSec;
    this.sides = { home: this.makeSide(home), away: this.makeSide(away) };
    this.possession = rng.chance(0.5) ? 'home' : 'away';

    if (opts.userAthleteId) {
      if (home.roster.some((a) => a.id === opts.userAthleteId)) this.userSide = 'home';
      else if (away.roster.some((a) => a.id === opts.userAthleteId)) this.userSide = 'away';
    }
    if (opts.keyMoments && this.userSide) {
      for (const q of [1, 2, 3]) {
        this.momentPlan.push({ quarter: q, atClock: Math.round(this.quarterSec * rng.range(0.2, 0.75)), fired: false });
      }
    }
    this.updateLineups();
  }

  private makeSide(input: SimTeamInput): SideState {
    // the user's coach can move them up or down the depth chart
    const rank = (a: Athlete) => this.ovr(a) + (this.isUser(a) ? (this.opts.userMods?.rankBoost ?? 0) : 0);
    const roster = [...input.roster].sort((a, b) => rank(b) - rank(a));
    const lines = new Map<string, PlayerLine>();
    const share = new Map<string, number>();
    roster.forEach((a, i) => {
      lines.set(a.id, emptyLine(a.id));
      const base = MINUTE_SHARE[i] ?? 0.01;
      share.set(a.id, this.isUser(a) ? clamp(base * (1 + (this.opts.userMods?.minutesBias ?? 0)), 0.02, 0.92) : base);
    });
    return { input, roster, onCourt: [], lines, quarters: [0], score: 0, share };
  }

  /* ── ratings ── */

  r(a: Athlete, k: RatingKey): number {
    return clamp(a.ratings[k] + (this.opts.ratingMods?.[a.id] ?? 0), 1, 99);
  }

  private ovr(a: Athlete): number {
    return overall(a.ratings) + (this.opts.ratingMods?.[a.id] ?? 0);
  }

  private other(s: Side): Side {
    return s === 'home' ? 'away' : 'home';
  }

  private line(s: Side, a: Athlete): PlayerLine {
    return this.sides[s].lines.get(a.id)!;
  }

  private eligible(s: Side): Athlete[] {
    const side = this.sides[s];
    const ok = side.roster.filter((a) => side.lines.get(a.id)!.pf < this.opts.foulOut);
    return ok.length >= 5 ? ok : side.roster.slice(0, 5);
  }

  /* ── rotation ── */

  private isClosingTime(): boolean {
    return this.quarter >= 4 && this.clock <= this.quarterSec / 4;
  }

  private updateLineups() {
    const segLen = this.quarter > 4 ? Infinity : this.quarterSec / SEGMENTS_PER_Q;
    const seg = this.quarter > 4 ? 100 + this.quarter : (this.quarter - 1) * SEGMENTS_PER_Q + Math.min(SEGMENTS_PER_Q - 1, Math.floor((this.quarterSec - this.clock) / segLen));
    if (seg === this.segment) return;
    this.segment = seg;
    const totalSec = this.quarterSec * 4;
    const forceBest = seg === 0 || seg === 2 * SEGMENTS_PER_Q || this.quarter > 4 || this.isClosingTime();

    for (const s of ['home', 'away'] as Side[]) {
      const side = this.sides[s];
      const elig = this.eligible(s);
      let five: Athlete[];
      if (forceBest) {
        five = elig.slice(0, 5);
      } else {
        const elapsed = this.elapsedInGame + 1;
        five = [...elig]
          .map((a) => ({
            a,
            deficit: side.share.get(a.id)! * (elapsed + totalSec / 16) - side.lines.get(a.id)!.sec,
          }))
          .sort((x, y) => y.deficit - x.deficit)
          .slice(0, 5)
          .map((x) => x.a);
      }
      side.onCourt = five;
    }
  }

  userOnCourt(): boolean {
    if (!this.userSide) return false;
    return this.sides[this.userSide].onCourt.some((a) => a.id === this.opts.userAthleteId);
  }

  private userAthlete(): Athlete | undefined {
    if (!this.userSide) return undefined;
    return this.sides[this.userSide].roster.find((a) => a.id === this.opts.userAthleteId);
  }

  /* ── main loop ── */

  /** Run until a key moment needs a decision or the game ends. */
  step(): SimStatus {
    return this.advance() as SimStatus;
  }

  /** Like step(), but yields after `maxIters` loop iterations so the UI can animate. */
  advance(maxIters = Infinity): SimStatus | { type: 'running' } {
    if (this.pending) return { type: 'moment', moment: this.pending };
    let iters = 0;
    while (!this.final) {
      if (iters++ >= maxIters) return { type: 'running' };
      if (this.clock <= 0) {
        this.endPeriod();
        continue;
      }
      this.updateLineups();
      const m = this.checkMoment();
      if (m) {
        this.pending = m;
        return { type: 'moment', moment: m };
      }
      this.runPossession();
    }
    return { type: 'final' };
  }

  runToEnd(): BoxScore {
    while (this.step().type === 'moment') {
      // auto-resolve with the highest-odds option (used for tests / auto-sim)
      const best = [...this.pending!.options].sort((a, b) => b.odds - a.odds)[0];
      this.resolveMoment(best.id);
    }
    return this.boxScore();
  }

  private endPeriod() {
    const h = this.sides.home.score;
    const a = this.sides.away.score;
    if (this.quarter >= 4 && h !== a) {
      this.final = true;
      this.pushFeed('home', `Final: ${this.sides.home.input.abbrev} ${h}, ${this.sides.away.input.abbrev} ${a}`);
      return;
    }
    this.pushFeed('home', this.quarter >= 4 ? 'End of regulation — we are going to overtime!' : `End of Q${this.quarter}`);
    this.quarter += 1;
    this.clock = this.quarter > 4 ? Math.max(4, Math.round(this.opts.quarterMinutes / 2)) * 60 : this.quarterSec;
    this.sides.home.quarters.push(0);
    this.sides.away.quarters.push(0);
    this.segment = -1;
    if (this.quarter === 3) this.possession = this.rng.chance(0.5) ? 'home' : 'away';
  }

  private tick(sec: number) {
    const t = Math.min(sec, this.clock);
    this.clock -= t;
    this.elapsedInGame += t;
    for (const s of ['home', 'away'] as Side[]) {
      for (const a of this.sides[s].onCourt) this.line(s, a).sec += t;
    }
  }

  private score(s: Side, pts: number) {
    const side = this.sides[s];
    side.score += pts;
    side.quarters[side.quarters.length - 1] += pts;
  }

  private pushFeed(side: Side, text: string, extra: Partial<PlayEvent> = {}) {
    this.feed.push({
      quarter: this.quarter,
      clock: this.clock,
      side,
      text,
      home: this.sides.home.score,
      away: this.sides.away.score,
      ...extra,
    });
  }

  /* ── possession resolution ── */

  private usage(a: Athlete): number {
    const scoring = this.r(a, 'shooting') * 0.45 + this.r(a, 'finishing') * 0.4 + this.r(a, 'handles') * 0.15;
    return Math.exp((scoring - this.opts.levelMean) / 9);
  }

  private pickShot(a: Athlete): ShotType {
    const mean = this.opts.levelMean;
    const w = {
      rim: Math.max(5, this.r(a, 'finishing') + this.r(a, 'athleticism') * 0.4 - mean * 0.9),
      mid: Math.max(5, this.r(a, 'shooting') * 0.5 + this.r(a, 'iq') * 0.2 - mean * 0.4),
      three: Math.max(2, this.r(a, 'shooting') * 1.1 - mean * 0.75),
    };
    return this.rng.weighted(['rim', 'mid', 'three'] as ShotType[], (t) => w[t] ** 1.5);
  }

  private defenderFor(def: Side, shooter: Athlete, off: Side): Athlete {
    const idx = this.sides[off].onCourt.findIndex((x) => x.id === shooter.id);
    return this.sides[def].onCourt[Math.max(0, idx)] ?? this.sides[def].onCourt[0];
  }

  shotOdds(shooter: Athlete, defender: Athlete, type: ShotType, bonus = 0): number {
    const m = this.opts.levelMean;
    const dDef = this.r(defender, 'defense') - m;
    let p: number;
    if (type === 'rim') {
      p = 0.56 + (this.r(shooter, 'finishing') - m) * 0.006 + (this.r(shooter, 'athleticism') - this.r(defender, 'athleticism')) * 0.002 - dDef * 0.003;
    } else if (type === 'mid') {
      p = 0.41 + (this.r(shooter, 'shooting') - m) * 0.005 + (this.r(shooter, 'iq') - m) * 0.001 - dDef * 0.0025;
    } else {
      p = 0.345 + (this.r(shooter, 'shooting') - m) * 0.0055 - dDef * 0.0018;
    }
    // game plan, film study and badges only ever tilt the user's own shots
    const mods = this.opts.userMods;
    if (mods && this.isUser(shooter)) p += mods.shot[type] + mods.all;
    return clamp(p + bonus, 0.12, 0.82);
  }

  private ftPct(a: Athlete): number {
    return clamp(0.48 + this.r(a, 'shooting') * 0.0045, 0.4, 0.93);
  }

  private shotCoords(type: ShotType): { x: number; y: number } {
    const ang = this.rng.range(-Math.PI / 2, Math.PI / 2);
    const dist = type === 'rim' ? this.rng.range(0.02, 0.12) : type === 'mid' ? this.rng.range(0.22, 0.42) : this.rng.range(0.5, 0.58);
    return { x: 0.5 + Math.sin(ang) * dist * 0.95, y: Math.cos(ang) * dist };
  }

  private runPossession() {
    const off = this.possession;
    const def = this.other(off);
    const offFive = this.sides[off].onCourt;
    const defFive = this.sides[def].onCourt;
    const len = this.rng.range(11, 22) * (this.opts.pace ?? 1);
    this.tick(len * 0.85);

    const actor = this.rng.weighted(offFive, (a) => this.usage(a));
    const defAvg = defFive.reduce((s, d) => s + this.r(d, 'defense'), 0) / 5;

    // Turnover
    const pTov = clamp(0.13 + (defAvg - this.r(actor, 'handles')) * 0.0018 - (this.r(actor, 'iq') - this.opts.levelMean) * 0.001, 0.06, 0.24);
    if (this.rng.chance(pTov)) {
      this.line(off, actor).tov++;
      if (this.rng.chance(0.5)) {
        const stealer = this.rng.weighted(defFive, (d) => this.r(d, 'defense') ** 2);
        this.line(def, stealer).stl++;
        this.pushFeed(off, `${shortName(stealer)} picks off ${shortName(actor)}.`, { user: this.isUser(actor) || this.isUser(stealer) });
      } else {
        this.pushFeed(off, `Turnover by ${shortName(actor)}.`, { user: this.isUser(actor) });
      }
      this.tick(len * 0.15);
      this.possession = def;
      return;
    }

    this.attemptShot(off, actor, this.pickShot(actor), 0);
    this.tick(len * 0.15);
  }

  private isUser(a: Athlete) {
    return a.id === this.opts.userAthleteId;
  }

  /**
   * Resolves a shot attempt (including fouls, assists, rebounds) and sets next possession.
   * Returns whether the shot (or and-one/free throws) produced points.
   */
  private attemptShot(
    off: Side,
    shooter: Athlete,
    type: ShotType,
    bonus: number,
    o: { assister?: Athlete; foulBoost?: number; forced?: boolean; defender?: Athlete } = {},
  ): { made: boolean; pts: number } {
    const def = this.other(off);
    const defender = o.defender ?? this.defenderFor(def, shooter, off);
    const forcedAssister = o.assister;
    const p = this.shotOdds(shooter, defender, type, bonus);
    const foulP = (type === 'rim' ? 0.13 : type === 'mid' ? 0.05 : 0.02) + (o.foulBoost ?? 0);
    let fouled: boolean;
    let made: boolean;
    if (o.forced !== undefined) {
      // Outcome decided by the key-moment roll; only an and-one can be layered on top.
      made = o.forced;
      fouled = made && this.rng.chance(foulP * 0.6);
    } else {
      fouled = this.rng.chance(foulP);
      made = this.rng.chance(fouled ? p * 0.6 : p);
    }
    const sl = this.line(off, shooter);
    const user = this.isUser(shooter) || this.isUser(defender);
    const coords = this.shotCoords(type);
    let pts = 0;

    if (fouled) this.line(def, defender).pf++;

    if (made) {
      const val = type === 'three' ? 3 : 2;
      sl.fga++;
      sl.fgm++;
      this.noteShot(shooter, true);
      if (type === 'three') {
        sl.tpa++;
        sl.tpm++;
      }
      sl.pts += val;
      pts += val;
      this.score(off, val);
      // assist
      const assistP = type === 'three' ? 0.82 : type === 'mid' ? 0.45 : 0.5;
      let assister: Athlete | undefined = forcedAssister;
      if (!assister && this.rng.chance(assistP)) {
        const mates = this.sides[off].onCourt.filter((a) => a.id !== shooter.id);
        assister = this.rng.weighted(mates, (a) => this.r(a, 'passing') ** 2);
      }
      if (assister) this.line(off, assister).ast++;
      const verb = type === 'three' ? 'drills a three' : type === 'mid' ? 'hits the pull-up' : this.rng.pick(['finishes at the rim', 'lays it in', 'throws it down']);
      this.pushFeed(off, `${shortName(shooter)} ${verb}${assister ? ` (${shortName(assister)} ast)` : ''}${fouled ? ' — and one!' : ''}`, {
        user: user || (assister ? this.isUser(assister) : false),
        scoring: true,
        shot: { ...coords, made: true, user: this.isUser(shooter) },
      });
      if (fouled) pts += this.freeThrows(off, shooter, 1);
      this.possession = def;
      return { made: true, pts };
    }

    if (fouled) {
      // no FGA on a missed shot when fouled
      const n = type === 'three' ? 3 : 2;
      this.pushFeed(off, `${shortName(shooter)} fouled by ${shortName(defender)} — ${n} shots.`, { user });
      pts += this.freeThrows(off, shooter, n);
      return { made: pts > 0, pts };
    }

    sl.fga++;
    this.noteShot(shooter, false);
    if (type === 'three') sl.tpa++;
    const blocked = type !== 'three' && this.rng.chance(clamp(0.05 + (this.r(defender, 'athleticism') + this.r(defender, 'defense') - 2 * this.opts.levelMean) * 0.0015 + (type === 'rim' ? 0.04 : 0), 0.01, 0.2));
    if (blocked) {
      this.line(def, defender).blk++;
      this.pushFeed(off, `${shortName(defender)} swats ${shortName(shooter)}!`, { user, shot: { ...coords, made: false, user: this.isUser(shooter) } });
    } else {
      this.pushFeed(off, `${shortName(shooter)} misses the ${type === 'three' ? 'three' : type === 'mid' ? 'jumper' : 'layup'}.`, {
        user,
        shot: { ...coords, made: false, user: this.isUser(shooter) },
      });
    }
    this.rebound(off);
    return { made: false, pts: 0 };
  }

  private noteShot(a: Athlete, made: boolean) {
    const list = this.recentShots.get(a.id) ?? [];
    list.push(made);
    if (list.length > RECENT_SHOTS) list.shift();
    this.recentShots.set(a.id, list);
  }

  private intelFor(a: Athlete, s: Side): PlayerIntel {
    return playerIntel(a, {
      ownTeam: s === this.userSide,
      line: this.line(s, a),
      recent: this.recentShots.get(a.id) ?? [],
      rating: (x, k) => this.r(x, k),
      ovr: this.ovr(a),
      mean: this.opts.levelMean,
      foulOut: this.opts.foulOut,
      short: shortName(a),
      keys: RATING_KEYS,
    });
  }

  private quickTeams(us: Side): MomentIntel['teams'] {
    const them = this.other(us);
    const q = (s: Side) => teamQuick(this.sides[s].input.abbrev, this.sides[s].score, [...this.sides[s].lines.values()]);
    return { us: q(us), them: q(them) };
  }

  private freeThrows(off: Side, shooter: Athlete, n: number): number {
    const sl = this.line(off, shooter);
    let made = 0;
    let lastMade = true;
    for (let i = 0; i < n; i++) {
      sl.fta++;
      lastMade = this.rng.chance(this.ftPct(shooter));
      if (lastMade) {
        sl.ftm++;
        sl.pts++;
        made++;
      }
    }
    this.score(off, made);
    if (made > 0) {
      this.pushFeed(off, `${shortName(shooter)} hits ${made} of ${n} at the line.`, { user: this.isUser(shooter), scoring: true });
    }
    if (lastMade) this.possession = this.other(off);
    else this.rebound(off);
    return made;
  }

  private rebound(off: Side) {
    const def = this.other(off);
    const offReb = this.sides[off].onCourt.reduce((s, a) => s + this.r(a, 'rebounding'), 0) / 5;
    const defReb = this.sides[def].onCourt.reduce((s, a) => s + this.r(a, 'rebounding'), 0) / 5;
    const pOff = clamp(0.25 + (offReb - defReb) * 0.004, 0.12, 0.4);
    if (this.rng.chance(pOff)) {
      const r = this.rng.weighted(this.sides[off].onCourt, (a) => this.r(a, 'rebounding') ** 2.5);
      this.line(off, r).orb++;
      this.possession = off;
      this.tick(this.rng.range(3, 7));
    } else {
      const r = this.rng.weighted(this.sides[def].onCourt, (a) => this.r(a, 'rebounding') ** 2.5);
      this.line(def, r).drb++;
      this.possession = def;
    }
  }

  /* ── key moments ── */

  private checkMoment(): KeyMoment | null {
    if (!this.opts.keyMoments || !this.userSide) return null;
    const user = this.userAthlete();
    if (!user) return null;

    // Clutch moments: last 2 minutes of Q4/OT, close game
    const margin = Math.abs(this.sides.home.score - this.sides.away.score);
    if (this.quarter >= 4 && this.clutchFired < 2 && this.userOnCourt()) {
      const firstWindow = this.clutchFired === 0 && this.clock <= 120 && margin <= 8;
      const secondWindow = this.clutchFired === 1 && this.clock <= 35 && margin <= 5;
      if (firstWindow || secondWindow) {
        this.clutchFired++;
        return this.buildMoment(true);
      }
    }

    for (const plan of this.momentPlan) {
      if (plan.fired || plan.quarter !== this.quarter) continue;
      if (this.clock <= plan.atClock) {
        if (this.userOnCourt()) {
          plan.fired = true;
          return this.buildMoment(false);
        }
        // user on bench: retry later in this quarter, drop when quarter ends
        if (this.clock < this.quarterSec * 0.1) plan.fired = true;
      }
    }
    return null;
  }

  private buildMoment(clutch: boolean): KeyMoment {
    const user = this.userAthlete()!;
    const us = this.userSide!;
    const them = this.other(us);
    const kind: 'offense' | 'defense' = this.possession === us ? 'offense' : 'defense';
    const oppFive = this.sides[them].onCourt;
    const rival = oppFive.find((a) => this.opts.rivalIds?.includes(a.id));
    const mods = this.opts.userMods ?? NO_MODS;
    // trait and Closer badge both help in clutch time; film study (`mods.all`) is already inside shotOdds for shots
    const clutchBonus = clutch ? (this.opts.userTraits?.includes('clutch') ? 0.05 : 0) + mods.clutch : 0;
    const id = `m${++this.momentSeq}`;
    const ourScore = this.sides[us].score;
    const theirScore = this.sides[them].score;
    const diff = ourScore - theirScore;
    const scoreTxt = diff === 0 ? 'tied' : diff > 0 ? `up ${diff}` : `down ${-diff}`;
    const clockTxt = formatClock(this.clock);

    if (kind === 'offense') {
      const defender = rival ?? this.defenderFor(them, user, us);
      const mates = this.sides[us].onCourt.filter((a) => a.id !== user.id);
      const bestMate = [...mates].sort((a, b) => this.usage(b) - this.usage(a))[0];
      const mateDef = this.defenderFor(them, bestMate, us);
      const mateShot = this.pickShotDeterministic(bestMate);
      const vs = (yours: string, you: number, theirs: string, them: number): Edge => ({ yours, you, theirs, them });
      const dDef = this.r(defender, 'defense');
      const mateRim = mateShot === 'rim';
      const opts: MomentOption[] = [
        { id: 'drive', label: 'Attack the rim', detail: `Put your head down and go at ${shortName(defender)}.`, odds: this.shotOdds(user, defender, 'rim', clutchBonus), rating: 'finishing', edge: vs('Your FIN', this.r(user, 'finishing'), 'His DEF', dDef) },
        { id: 'pullup', label: 'Pull-up jumper', detail: 'Rise up from the elbow.', odds: this.shotOdds(user, defender, 'mid', clutchBonus), rating: 'shooting', edge: vs('Your SHO', this.r(user, 'shooting'), 'His DEF', dDef) },
        { id: 'three', label: 'Step-back three', detail: 'Create space and let it fly.', odds: this.shotOdds(user, defender, 'three', clutchBonus - 0.03), rating: 'shooting', edge: vs('Your SHO', this.r(user, 'shooting'), 'His DEF', dDef) },
        {
          id: 'pass',
          label: `Find ${shortName(bestMate)}`,
          detail: 'Draw two and make the right play.',
          odds: clamp(this.shotOdds(bestMate, mateDef, mateShot, 0.08 + (this.r(user, 'passing') - this.opts.levelMean) * 0.003 + mods.pass + mods.all) * (1 - 0.04), 0.1, 0.85),
          rating: 'passing',
          edge: vs(`${shortName(bestMate)} ${mateRim ? 'FIN' : 'SHO'}`, this.r(bestMate, mateRim ? 'finishing' : 'shooting'), `${shortName(mateDef)} DEF`, this.r(mateDef, 'defense')),
        },
      ];
      // earned signature moves, best two, as extra options
      for (const s of mods.signatures.filter((x) => x.kind === 'offense' && x.shot).sort((a, b) => b.bonus - a.bonus).slice(0, 2)) {
        const type = s.shot!;
        opts.push({
          id: `sig:${s.id}`,
          label: s.label,
          detail: s.detail,
          odds: this.shotOdds(user, defender, type, clutchBonus + s.bonus - (type === 'three' ? 0.03 : 0)),
          rating: s.rating,
          edge: vs(type === 'rim' ? 'Your FIN' : 'Your SHO', this.r(user, type === 'rim' ? 'finishing' : 'shooting'), 'His DEF', dDef),
          signature: true,
        });
      }
      const youIntel = this.intelFor(user, us);
      const matchupIntel = this.intelFor(defender, them);
      const teammates = mates.map((a) => this.intelFor(a, us));
      const intel: MomentIntel = {
        you: youIntel,
        matchup: matchupIntel,
        teammates,
        opponents: oppFive.map((a) => this.intelFor(a, them)),
        teams: this.quickTeams(us),
        tips: tipsFor({ kind: 'offense', you: youIntel, matchup: matchupIntel, teammates, mean: this.opts.levelMean, foulOut: this.opts.foulOut }),
      };
      return {
        id,
        kind,
        clutch,
        quarter: this.quarter,
        clock: this.clock,
        homeScore: this.sides.home.score,
        awayScore: this.sides.away.score,
        situation: `${clutch ? 'CLUTCH — ' : ''}Q${this.quarter > 4 ? `OT${this.quarter - 4}` : this.quarter} ${clockTxt}, ${scoreTxt}. Ball in your hands, ${shortName(defender)} guarding you.`,
        opponentName: `${defender.firstName} ${defender.lastName}`,
        opponentId: defender.id,
        isRival: !!rival,
        options: opts,
        intel,
      };
    }

    // defense
    const attacker = rival ?? [...oppFive].sort((a, b) => this.usage(b) - this.usage(a))[0];
    const shot = this.pickShotDeterministic(attacker);
    const base = this.shotOdds(attacker, user, shot, 0);
    const m = this.opts.levelMean;
    const stealOdds = clamp(0.22 + (this.r(user, 'defense') + this.r(user, 'athleticism') - this.r(attacker, 'handles') - m) * 0.004 + clutchBonus + mods.steal + mods.all, 0.08, 0.6);
    const solidOdds = clamp(1 - base + 0.06 + (this.r(user, 'defense') - m) * 0.003 + clutchBonus + mods.solid + mods.all, 0.2, 0.88);
    const blockOdds = clamp(0.2 + (this.r(user, 'athleticism') + this.r(user, 'defense') - 2 * m) * 0.004 + (user.heightIn - 77) * 0.01 + clutchBonus + mods.block + mods.all, 0.06, 0.55);
    const baseOdds = { steal: stealOdds, solid: solidOdds, block: blockOdds };
    const youD = this.intelFor(user, us);
    const attackerIntel = this.intelFor(attacker, them);
    const mates = this.sides[us].onCourt.filter((a) => a.id !== user.id);
    const teammatesD = mates.map((a) => this.intelFor(a, us));
    const intelD: MomentIntel = {
      you: youD,
      matchup: attackerIntel,
      teammates: teammatesD,
      opponents: oppFive.map((a) => this.intelFor(a, them)),
      teams: this.quickTeams(us),
      expectedShot: shot,
      tips: tipsFor({ kind: 'defense', you: youD, matchup: attackerIntel, teammates: teammatesD, mean: m, foulOut: this.opts.foulOut, expectedShot: shot }),
    };
    const aAtt = shot === 'rim' ? 'finishing' : 'shooting';
    const defOpts: MomentOption[] = [
      { id: 'steal', label: 'Gamble for the steal', detail: 'High risk — if you miss, it is an easy look.', odds: stealOdds, rating: 'defense', edge: { yours: 'Your DEF', you: this.r(user, 'defense'), theirs: 'His HND', them: this.r(attacker, 'handles') } },
      { id: 'solid', label: 'Stay solid', detail: 'Stay in front, contest without fouling.', odds: solidOdds, rating: 'defense', edge: { yours: 'Your DEF', you: this.r(user, 'defense'), theirs: `His ${aAtt === 'finishing' ? 'FIN' : 'SHO'}`, them: this.r(attacker, aAtt) } },
      { id: 'block', label: 'Go for the block', detail: 'Meet them at the summit. Foul risk.', odds: blockOdds, rating: 'athleticism', edge: { yours: 'Your ATH', you: this.r(user, 'athleticism'), theirs: 'His ATH', them: this.r(attacker, 'athleticism') } },
    ];
    for (const s of mods.signatures.filter((x) => x.kind === 'defense' && x.base).sort((a, b) => b.bonus - a.bonus).slice(0, 2)) {
      const basic = defOpts.find((o) => o.id === s.base)!;
      defOpts.push({ id: `sig:${s.id}`, label: s.label, detail: s.detail, odds: clamp(baseOdds[s.base!] + s.bonus, 0.08, 0.9), rating: s.rating, edge: basic.edge, signature: true });
    }
    return {
      id,
      kind,
      clutch,
      quarter: this.quarter,
      clock: this.clock,
      homeScore: this.sides.home.score,
      awayScore: this.sides.away.score,
      situation: `${clutch ? 'CLUTCH — ' : ''}Q${this.quarter > 4 ? `OT${this.quarter - 4}` : this.quarter} ${clockTxt}, ${scoreTxt}. ${shortName(attacker)} is coming right at you.`,
      opponentName: `${attacker.firstName} ${attacker.lastName}`,
      opponentId: attacker.id,
      isRival: !!rival,
      options: defOpts,
      intel: intelD,
    };
  }

  private pickShotDeterministic(a: Athlete): ShotType {
    const s = this.r(a, 'shooting');
    const f = this.r(a, 'finishing');
    if (s > f + 6) return 'three';
    if (f > s + 3) return 'rim';
    return 'mid';
  }

  resolveMoment(optionId: string): MomentResult {
    const m = this.pending;
    if (!m) throw new Error('No pending moment');
    const opt = m.options.find((o) => o.id === optionId) ?? m.options[0];
    const user = this.userAthlete()!;
    const us = this.userSide!;
    const them = this.other(us);
    const roll = this.rng.next();
    const len = this.rng.range(8, 16);
    this.tick(len * 0.8);
    let success = false;
    let text = '';
    const opp = this.sides[them].onCourt.find((a) => a.id === m.opponentId);
    // an earned signature move plays out like the basic action it builds on, with its own odds and flavor
    const sig = opt.id.startsWith('sig:') ? this.opts.userMods?.signatures.find((s) => `sig:${s.id}` === opt.id) : undefined;
    const act = sig?.base ?? opt.id;

    if (m.kind === 'offense') {
      if (opt.id === 'pass') {
        const mates = this.sides[us].onCourt.filter((a) => a.id !== user.id);
        const mate = [...mates].sort((a, b) => this.usage(b) - this.usage(a))[0];
        success = roll < opt.odds;
        this.attemptShot(us, mate, this.pickShotDeterministic(mate), 0, { assister: user, forced: success });
        text = success ? `You draw the defense and dish to ${shortName(mate)} — bucket!` : `${shortName(mate)} gets a good look but it rims out.`;
      } else {
        const type: ShotType = sig?.shot ?? (opt.id === 'drive' ? 'rim' : opt.id === 'pullup' ? 'mid' : 'three');
        success = roll < opt.odds;
        const r = this.attemptShot(us, user, type, 0, { forced: success, foulBoost: type === 'rim' ? 0.1 : 0, defender: opp });
        text = sig
          ? `${success ? sig.win : sig.lose}${success ? ` ${r.pts} points.` : ''}`
          : success
          ? type === 'three'
            ? `Step back... SPLASH. ${r.pts} points.`
            : type === 'mid'
              ? `Pull-up, cash. ${r.pts} points.`
              : `You get downhill and finish through contact. ${r.pts} points.`
          : type === 'rim'
            ? 'You get to the rim but it rolls off.'
            : 'The shot is off the mark.';
      }
    } else {
      const attacker = opp ?? this.sides[them].onCourt[0];
      const shot = this.pickShotDeterministic(attacker);
      success = roll < opt.odds;
      if (act === 'steal') {
        if (success) {
          this.line(us, user).stl++;
          this.line(them, attacker).tov++;
          this.pushFeed(us, `${shortName(user)} jumps the passing lane — steal!`, { user: true });
          text = `You read it perfectly and pick ${shortName(attacker)}'s pocket.`;
          this.possession = us;
        } else {
          const r = this.attemptShot(them, attacker, 'rim', 0.18, { defender: user });
          text = r.made ? `You bite, and ${shortName(attacker)} walks in for an easy two.` : `You gamble and miss, but ${shortName(attacker)} blows the layup. Lucky.`;
        }
      } else if (act === 'block') {
        if (success) {
          this.line(us, user).blk++;
          this.line(them, attacker).fga++;
          if (shot === 'three') this.line(them, attacker).tpa++;
          this.pushFeed(them, `${shortName(user)} SENDS IT BACK on ${shortName(attacker)}!`, { user: true });
          text = `You meet ${shortName(attacker)} at the summit. Rejected.`;
          this.rebound(them);
        } else {
          const r = this.attemptShot(them, attacker, shot, 0.03, { foulBoost: 0.2, defender: user });
          text = r.made ? `You leave your feet and ${shortName(attacker)} scores anyway.` : `You miss the block but ${shortName(attacker)} misses too.`;
        }
      } else {
        // solid: shot odds reduced
        this.attemptShot(them, attacker, shot, 0, { forced: !success, defender: user });
        text = success ? `You stay in front, contest, and force a miss.` : `Great contest, but ${shortName(attacker)} hits a tough one.`;
      }
      if (sig) text = success ? sig.win : `${sig.lose} ${text}`;
    }
    this.tick(len * 0.2);

    const result: MomentResult = {
      momentId: m.id,
      optionId: opt.id,
      optionLabel: opt.label,
      success,
      roll,
      odds: opt.odds,
      text,
      clutch: m.clutch,
      quarter: m.quarter,
      clock: m.clock,
      margin: this.sides[us].score - this.sides[them].score,
    };
    this.momentResults.push(result);
    this.pending = null;
    return result;
  }

  /* ── output ── */

  private teamBox(s: Side): TeamBox {
    const side = this.sides[s];
    return {
      teamId: side.input.teamId,
      score: side.score,
      quarters: [...side.quarters],
      players: side.roster.map((a) => ({ ...side.lines.get(a.id)!, sec: Math.round(side.lines.get(a.id)!.sec) })),
    };
  }

  boxScore(): BoxScore {
    return { home: this.teamBox('home'), away: this.teamBox('away') };
  }

  liveScore() {
    return { home: this.sides.home.score, away: this.sides.away.score, quarter: this.quarter, clock: this.clock };
  }

  userLine(): PlayerLine | undefined {
    if (!this.userSide || !this.opts.userAthleteId) return undefined;
    return this.sides[this.userSide].lines.get(this.opts.userAthleteId);
  }
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
