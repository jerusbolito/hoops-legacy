import { create } from 'zustand';
import { LEVEL_CONFIG } from '../data/teams';
import { BADGE_BY_ID, checkBadgeUnlocks } from '../engine/badges';
import { applyCombine, applyContestResult, playRound, runCombine, startContest, type CombineResult, type ContestState, type EventId, type Style } from '../engine/events';
import { acceptOffer, answerPress, declineOffer, type PressOptionId, type PressOutcome } from '../engine/media';
import { resolveRipple, updateEstrangement } from '../engine/consequences';
import {
  addNews,
  advanceWeek,
  commitToCollege,
  createCareer,
  createUserGameSim,
  doSummerTraining,
  doTraining,
  finishUserGame,
  freeAgencyOffers,
  recruitingOffers,
  recruitingStars,
  runDraft,
  setGamePlan,
  setPlayHurt,
  signFreeAgent,
  userAthlete,
  withRng,
  completeScene,
  type CollegeOffer,
  type DraftResult,
  type FaOffer,
  type GameReport,
  type NewCareerInput,
} from '../engine/career';
import { applyEffects, GAME_CAPS, SCENE_CAPS } from '../engine/effects';
import type { GameSim } from '../engine/gameSim';
import { pickHighlight, type Highlight } from '../engine/highlights';
import { overall, ratingTier, shortName } from '../engine/ratings';
import { seasonStory } from '../engine/analytics';
import { buildSeasonReview } from '../engine/seasonReview';
import type { TrainingFocus, TrainingResult } from '../engine/progression';
import { RNG } from '../engine/rng';
import { createClient } from '../llm/client';
import type { LLMClient, LLMConfig } from '../llm/types';
import { generateRecap, generateScene, generateSeasonSummary, narrateFlavor, resolveScene, type Recap, type SceneResolution } from '../narrative/narrator';
import type { SceneSetup } from '../narrative/parse';
import { pickScene, type ScenePlan } from '../narrative/scenes';
import { loadGame, loadLLMConfig, saveGame, storeLLMConfig } from './persistence';
import type { Reveal, RevealData } from './reveals';
import { RATING_KEYS, RATING_LABELS, type GameState, type PlanId, type RatingKey, type Ratings, type ScheduledGame } from './schemas';

export type Screen = 'setup' | 'title' | 'create' | 'game';
export type Tab = 'hub' | 'profile' | 'relationships' | 'league' | 'analytics' | 'media' | 'story' | 'memory';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'award' | 'levelup';
}

export interface SceneState {
  plan: ScenePlan;
  setup: SceneSetup | null;
  loading: boolean;
  chosen: string | null;
  resolution: (SceneResolution & { applied: string[] }) | null;
  error?: string;
}

export interface LiveGame {
  sim: GameSim;
  game: ScheduledGame;
  /** bump to re-render as the sim advances */
  tick: number;
}

export interface PostGame {
  report: GameReport;
  recap: (Recap & { applied: string[] }) | null;
  highlight: Highlight | null;
}

interface Store {
  screen: Screen;
  tab: Tab;
  llm: LLMConfig | null;
  client: LLMClient | null;
  game: GameState | null;
  scene: SceneState | null;
  live: LiveGame | null;
  post: PostGame | null;
  lastTraining: TrainingResult | null;
  offers: { college?: CollegeOffer[]; fa?: FaOffer[] };
  draft: DraftResult | null;
  phaseNarration: string | null;
  busy: boolean;
  toasts: Toast[];
  reveals: Reveal[];
  /** What the last press answer did, shown until dismissed. */
  pressOutcome: PressOutcome | null;
  /** The event the player has open, and its live state (not saved). */
  eventId: EventId | null;
  contest: ContestState | null;
  combine: CombineResult | null;

  pushReveals(items: RevealData[]): void;
  dismissReveal(): void;
  setScreen(s: Screen): void;
  setTab(t: Tab): void;
  setLLM(config: LLMConfig, remember: boolean): void;
  boot(): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;

  newCareer(input: NewCareerInput): Promise<void>;
  loadCareer(id: string): Promise<void>;
  openCareer(state: GameState): Promise<void>;
  closeCareer(): void;

  train(focus: TrainingFocus): void;
  summerTrain(focuses: RatingKey[]): void;
  startScene(): Promise<void>;
  choose(choiceId: string): Promise<void>;
  finishScene(): void;
  /** Pre-game: pick the plan and whether to spend energy on film. */
  setPlan(id: PlanId, film: boolean): void;
  /** Pre-game: play through a minor injury (or stop). */
  setHurt(on: boolean): void;
  startGame(): void;
  bumpLive(): void;
  completeGame(): Promise<void>;
  dismissPostGame(): void;
  answerPress(id: PressOptionId): void;
  dismissPress(): void;
  takeOffer(id: string): void;
  turnDownOffer(id: string): void;
  openEvent(id: EventId): void;
  playContest(style: Style): void;
  finishContest(): void;
  runCombine(approach: 'push' | 'steady'): void;
  finishCombine(): void;
  closeEvent(): void;
  advance(): Promise<void>;
  setFlag(key: string, value: boolean): void;

  loadRecruiting(): void;
  commit(name: string): Promise<void>;
  enterDraft(): Promise<void>;
  loadFreeAgency(): void;
  sign(offer: FaOffer): Promise<void>;
}

let toastSeq = 0;
let revealSeq = 0;

export const useStore = create<Store>((set, get) => {
  /** Clone → mutate → commit → autosave. All game-state changes go through here. */
  function mutate<T>(fn: (draft: GameState) => T): T {
    const cur = get().game;
    if (!cur) throw new Error('No game loaded');
    const draft = structuredClone(cur);
    const badgesBefore = draft.player.badges.length;
    const out = fn(draft);
    // a badge can be earned by a game, training, or even a story effect on ratings
    checkBadgeUnlocks(draft);
    draft.updatedAt = Date.now();
    set({ game: draft });
    void saveGame(draft).catch((e) => get().toast(`Autosave failed: ${(e as Error).message}`, 'bad'));
    for (const id of draft.player.badges.slice(badgesBefore)) get().toast(`Badge earned: ${BADGE_BY_ID[id]?.name ?? id}!`, 'award');
    return out;
  }

  /** Toast whenever a skill (or overall) crosses into a new named tier. */
  function announceTiers(before: Ratings, overallBefore: number) {
    const g = get().game;
    if (!g) return;
    const a = userAthlete(g);
    for (const k of RATING_KEYS) {
      const was = ratingTier(before[k]);
      const now = ratingTier(a.ratings[k]);
      if (now.index > was.index) get().toast(`${RATING_LABELS[k]} reached ${a.ratings[k]}: ${now.name}!`, 'levelup');
    }
    const o = overall(a.ratings);
    if (ratingTier(o).index > ratingTier(overallBefore).index) get().toast(`Overall ${o}: you are now ${ratingTier(o).name}!`, 'levelup');
  }

  const snapshot = () => {
    const a = userAthlete(get().game!);
    return { ratings: { ...a.ratings } as Ratings, overall: overall(a.ratings) };
  };

  return {
    screen: 'setup',
    tab: 'hub',
    llm: null,
    client: null,
    game: null,
    scene: null,
    live: null,
    post: null,
    lastTraining: null,
    offers: {},
    draft: null,
    phaseNarration: null,
    busy: false,
    toasts: [],
    reveals: [],
    pressOutcome: null,
    eventId: null,
    contest: null,
    combine: null,

    pushReveals(items) {
      if (!items.length) return;
      set({ reveals: [...get().reveals, ...items.map((it) => ({ ...it, id: ++revealSeq }) as Reveal)] });
    },
    dismissReveal: () => set({ reveals: get().reveals.slice(1) }),

    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab }),

    setLLM(config, remember) {
      storeLLMConfig(config, remember);
      set({ llm: config, client: createClient(config) });
    },

    boot() {
      const saved = loadLLMConfig();
      if (saved) set({ llm: saved.config, client: createClient(saved.config), screen: 'title' });
      else set({ screen: 'setup' });
    },

    toast(text, kind = 'info') {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts, { id, text, kind }].slice(-5) });
      setTimeout(() => get().dismissToast(id), kind === 'award' ? 7000 : 4500);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    async newCareer(input) {
      const state = createCareer(input);
      await saveGame(state);
      await get().openCareer(state);
    },

    async loadCareer(id) {
      const state = await loadGame(id);
      if (!state) return get().toast('Save not found', 'bad');
      await get().openCareer(state);
    },

    async openCareer(state) {
      set({ game: state, screen: 'game', tab: 'hub', scene: null, live: null, post: null, offers: {}, draft: null, phaseNarration: null, lastTraining: null, pressOutcome: null, eventId: null, contest: null, combine: null });
      await saveGame(state);
    },

    closeCareer: () => set({ game: null, screen: 'title', scene: null, live: null, post: null, reveals: [], pressOutcome: null, eventId: null, contest: null, combine: null }),

    /* ── weekly steps ── */

    train(focus) {
      const before = snapshot();
      const r = mutate((d) => doTraining(d, focus));
      set({ lastTraining: r });
      announceTiers(before.ratings, before.overall);
    },

    summerTrain(focuses) {
      const before = snapshot();
      const gains = mutate((d) => doSummerTraining(d, focuses));
      set({ lastTraining: { gains, energyDelta: 0, academicsDelta: 0, text: 'A summer of work changes your game.' } });
      announceTiers(before.ratings, before.overall);
    },

    async startScene() {
      if (get().scene) return;
      const plan = mutate((d) => withRng(d, (rng) => pickScene(d, rng)));
      set({ scene: { plan, setup: null, loading: true, chosen: null, resolution: null } });
      const res = await generateScene(get().client, get().game!, plan);
      if (res.error) get().toast(`AI narration failed, using a template: ${res.error.slice(0, 120)}`, 'bad');
      set({ scene: { plan, setup: res.setup, loading: false, chosen: null, resolution: null, error: res.error } });
    },

    async choose(choiceId) {
      const sc = get().scene;
      if (!sc?.setup || sc.chosen) return;
      const choice = sc.setup.choices.find((c) => c.id === choiceId)!;
      set({ scene: { ...sc, chosen: choiceId, loading: true } });
      const before = snapshot();
      const res = await resolveScene(get().client, get().game!, sc.plan, sc.setup, choice);
      if (res.error) get().toast(`AI narration failed, using a template.`, 'bad');
      const applied = mutate((d) => {
        const rng = new RNG(d.rngState);
        const r = applyEffects(d, res.effects, `scene:${sc.plan.kind}`, SCENE_CAPS, rng);
        d.rngState = rng.state;
        if (sc.plan.rippleId) resolveRipple(d, sc.plan.rippleId);
        for (const msg of updateEstrangement(d)) {
          addNews(d, msg);
          r.applied.push(msg);
        }
        d.story.log.push({ season: d.career.season, week: d.career.week, phase: d.career.phase, kind: sc.plan.kind, title: sc.setup!.title, summary: res.summary });
        if (res.hook) {
          d.story.threads.push(res.hook.slice(0, 200));
          if (d.story.threads.length > 3) d.story.threads.splice(0, d.story.threads.length - 3);
        }
        if (d.story.log.length > 200) d.story.log.splice(0, d.story.log.length - 200);
        return r.applied;
      });
      set({ scene: { ...get().scene!, loading: false, resolution: { ...res, applied } } });
      announceTiers(before.ratings, before.overall);
    },

    finishScene() {
      mutate((d) => completeScene(d));
      set({ scene: null });
    },

    setPlan(id, film) {
      const ok = mutate((d) => setGamePlan(d, id, film));
      if (!ok) get().toast('You are too worn out to spend the day on film.', 'bad');
    },

    setHurt(on) {
      mutate((d) => setPlayHurt(d, on));
    },

    startGame() {
      const g = get().game!;
      const created = createUserGameSim(g);
      if (!created) {
        mutate((d) => {
          d.career.step = 'done';
        });
        return;
      }
      set({ live: { ...created, tick: 0 }, post: null });
    },

    bumpLive() {
      const l = get().live;
      if (l) set({ live: { ...l, tick: l.tick + 1 } });
    },

    async completeGame() {
      const live = get().live;
      if (!live) return;
      const me = userAthlete(get().game!);
      const userSide = live.sim.sides.home.roster.some((a) => a.id === me.id) ? 'home' : 'away';
      const highlight = pickHighlight(live.sim.feed, shortName(me), userSide);
      const report = mutate((d) => finishUserGame(d, live.sim, live.game));
      set({ live: null, post: { report, recap: null, highlight } });
      if (report.injury) get().toast(`Injury: ${report.injury}`, 'bad');
      const recap = await generateRecap(get().client, get().game!, report, get().game!.lastBox!.box);
      const applied = mutate((d) => {
        const r = applyEffects(d, recap.effects, 'game', GAME_CAPS);
        d.story.log.push({
          season: d.career.season,
          week: d.career.week,
          phase: d.career.phase,
          kind: 'game',
          title: recap.headline,
          summary: `${report.won ? 'Won' : 'Lost'} ${report.teamScore}-${report.oppScore} vs ${d.teams[report.oppId].name}.${report.line && report.line.sec > 0 ? ` You had ${report.line.pts} pts.` : ''}`,
        });
        return r.applied;
      });
      set({ post: { report, recap: { ...recap, applied }, highlight } });
    },

    dismissPostGame: () => set({ post: null }),

    /* ── press, endorsements, events ── */

    answerPress(id) {
      const out = mutate((d) => withRng(d, (rng) => answerPress(d, rng, id)));
      if (out) set({ pressOutcome: out });
    },
    dismissPress: () => set({ pressOutcome: null }),

    takeOffer(id) {
      const deal = mutate((d) => withRng(d, (rng) => acceptOffer(d, rng, id)));
      if (deal) get().toast(`Signed with ${deal.brand}: $${deal.perSeason.toLocaleString()} a season.`, 'good');
      else get().toast('You already have a deal in that category.', 'bad');
    },
    turnDownOffer(id) {
      mutate((d) => declineOffer(d, id));
    },

    openEvent(id) {
      const g = get().game!;
      if (id === 'combine') set({ eventId: id, contest: null, combine: null });
      else set({ eventId: id, contest: startContest(g, id), combine: null });
    },
    playContest(style) {
      const c = get().contest;
      const g = get().game;
      if (!c || !g || c.finished) return;
      set({ contest: playRound(c, LEVEL_CONFIG[g.league.level].ratingMean, style) });
    },
    finishContest() {
      const c = get().contest;
      if (!c?.finished) return;
      const r = mutate((d) => applyContestResult(d, c));
      get().toast(r.placement === 1 ? 'You won the contest!' : `You finished #${r.placement} in the contest.`, r.placement <= 3 ? 'award' : 'info');
      set({ contest: null, eventId: null });
    },
    runCombine(approach) {
      const g = get().game;
      if (!g) return;
      set({ combine: runCombine(g, approach) });
    },
    finishCombine() {
      const res = get().combine;
      if (!res) return;
      mutate((d) => applyCombine(d, res));
      get().toast(res.boost >= 0 ? `The combine helped your stock (+${res.boost.toFixed(1)}).` : `The combine hurt your stock (${res.boost.toFixed(1)}).`, res.boost >= 0 ? 'good' : 'bad');
      set({ combine: null, eventId: null });
    },
    closeEvent: () => set({ eventId: null, contest: null, combine: null }),

    async advance() {
      if (get().busy) return;
      set({ busy: true, lastTraining: null });
      try {
        const prevSeason = get().game!.career.season;
        const offersBefore = new Set(get().game!.offers.map((o) => o.id));
        const r = mutate((d) => advanceWeek(d));
        for (const o of get().game!.offers.filter((x) => !offersBefore.has(x.id))) get().toast(`${o.brand} wants to sign you. Check the Media tab.`, 'good');
        // championships and awards get full-screen reveals instead of toasts
        r.messages.filter((m) => !m.startsWith('Award') && !m.startsWith('CHAMP')).forEach((m) => get().toast(m, 'info'));
        if (r.seasonEnded) {
          const g = get().game!;
          const team = g.teams[g.career.teamId];
          const name = (() => {
            const a = userAthlete(g);
            return `${a.firstName} ${a.lastName}`;
          })();
          const items: RevealData[] = [];
          if (g.league.champion === g.career.teamId) {
            const st = g.league.standings[team.id];
            items.push({ kind: 'champion', teamName: team.name, mascot: team.mascot, abbrev: team.abbrev, colors: team.colors, record: `${st.w}-${st.l}`, level: g.career.level, season: prevSeason });
          }
          for (const a of g.player.awards.filter((x) => x.season === prevSeason && !x.name.endsWith('Champion'))) {
            items.push({ kind: 'award', name: a.name, level: a.level, season: prevSeason, colors: team.colors, player: name });
          }
          get().pushReveals(items);
          const { summary, career } = await generateSeasonSummary(get().client, get().game!);
          mutate((d) => {
            d.story.seasonSummaries.push({ season: prevSeason, text: summary });
            d.story.careerSummary = career;
            d.story.threads = d.story.threads.slice(-2); // stale hooks fade across seasons
          });
          get().pushReveals([{ kind: 'season', review: buildSeasonReview(get().game!, prevSeason), summary }]);
          const story = seasonStory(get().game!, prevSeason);
          if (story.form.length >= 3) get().pushReveals([{ kind: 'seasonStory', story, colors: team.colors, player: name }]);
        }
      } finally {
        set({ busy: false });
      }
    },

    setFlag(key, value) {
      mutate((d) => {
        d.story.flags[key] = value;
      });
    },

    /* ── career transitions ── */

    loadRecruiting() {
      if (get().offers.college) return;
      const college = mutate((d) => recruitingOffers(d));
      set({ offers: { ...get().offers, college } });
    },

    async commit(name) {
      set({ busy: true });
      try {
        const g = get().game!;
        const text = await narrateFlavor(
          get().client,
          g,
          `Commitment day. In front of family, friends and local cameras, you announce your college decision: ${name}. Show reactions from the people closest to you.`,
          `Hats on the table. You reach past the others and pull on the ${name} cap. The room erupts.`,
          Object.values(g.npcs).filter((n) => n.active && ['family', 'friend', 'mentor', 'coach'].includes(n.role)).map((n) => n.id),
        );
        const stars = recruitingStars(g);
        mutate((d) => {
          commitToCollege(d, name);
          d.story.log.push({ season: d.career.season, week: 0, phase: 'recruiting', kind: 'commitment', title: `Committed to ${name}`, summary: `You committed to ${name}.` });
        });
        const after = get().game!;
        const college = after.teams[after.career.teamId];
        const me = userAthlete(after);
        get().pushReveals([{ kind: 'commit', player: `${me.firstName} ${me.lastName}`, college: college.name, mascot: college.mascot, abbrev: college.abbrev, colors: college.colors, stars }]);
        set({ offers: {}, phaseNarration: text });
      } finally {
        set({ busy: false });
      }
    },

    async enterDraft() {
      set({ busy: true });
      try {
        const collegeName = get().game!.teams[get().game!.player.collegeId ?? '']?.name ?? '';
        const result = mutate((d) => runDraft(d));
        const g = get().game!;
        {
          const team = g.teams[g.career.teamId];
          const me = userAthlete(g);
          get().pushReveals([{ kind: 'draft', player: `${me.firstName} ${me.lastName}`, college: collegeName, pick: result.pick, teamName: team.name, mascot: team.mascot, abbrev: team.abbrev, colors: team.colors, salary: result.salary, years: result.years, ovr: overall(me.ratings) }]);
        }
        const text = await narrateFlavor(
          get().client,
          g,
          result.pick
            ? `Draft night. The commissioner calls your name: pick #${result.pick} to the ${result.teamName}. Show the moment and who is with you.`
            : `Draft night ends without your name being called. Later that night, the ${result.teamName} call with a contract offer. Show the gut-punch and the comeback.`,
          result.pick ? `"With pick number ${result.pick}..." You hear your name and the room goes white.` : `Two rounds. No call. Then your phone rings: the ${result.teamName} want you.`,
          Object.values(g.npcs).filter((n) => n.active && ['family', 'friend', 'agent'].includes(n.role)).map((n) => n.id),
        );
        mutate((d) => {
          d.story.log.push({ season: d.career.season, week: 0, phase: 'draft', kind: 'draft', title: 'Draft Night', summary: result.pick ? `Drafted #${result.pick} by ${result.teamName}.` : `Went undrafted; signed with ${result.teamName}.` });
        });
        set({ draft: result, phaseNarration: text });
      } finally {
        set({ busy: false });
      }
    },

    loadFreeAgency() {
      if (get().offers.fa) return;
      const fa = mutate((d) => freeAgencyOffers(d));
      set({ offers: { ...get().offers, fa } });
    },

    async sign(offer) {
      mutate((d) => {
        signFreeAgent(d, offer);
        d.story.log.push({ season: d.career.season, week: 0, phase: 'free_agency', kind: 'contract', title: 'New Contract', summary: `Signed ${offer.years} years at $${(offer.salary / 1e6).toFixed(1)}M/yr with ${offer.teamName}.` });
      });
      const g = get().game!;
      const team = g.teams[g.career.teamId];
      const me = userAthlete(g);
      get().pushReveals([{ kind: 'contract', player: `${me.firstName} ${me.lastName}`, teamName: team.name, mascot: team.mascot, abbrev: team.abbrev, colors: team.colors, salary: offer.salary, years: offer.years }]);
      set({ offers: {}, phaseNarration: null });
    },
  };
});
