import { create } from 'zustand';
import {
  advanceWeek,
  commitToCollege,
  createCareer,
  createUserGameSim,
  doSummerTraining,
  doTraining,
  finishUserGame,
  freeAgencyOffers,
  recruitingOffers,
  runDraft,
  signFreeAgent,
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
import type { TrainingFocus, TrainingResult } from '../engine/progression';
import { RNG } from '../engine/rng';
import { createClient } from '../llm/client';
import type { LLMClient, LLMConfig } from '../llm/types';
import { generateRecap, generateScene, generateSeasonSummary, narrateFlavor, resolveScene, type Recap, type SceneResolution } from '../narrative/narrator';
import type { SceneSetup } from '../narrative/parse';
import { pickScene, type ScenePlan } from '../narrative/scenes';
import { loadGame, loadLLMConfig, saveGame, storeLLMConfig } from './persistence';
import type { GameState, RatingKey, ScheduledGame } from './schemas';

export type Screen = 'setup' | 'title' | 'create' | 'game';
export type Tab = 'hub' | 'profile' | 'relationships' | 'league' | 'story';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'award';
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
  startGame(): void;
  bumpLive(): void;
  completeGame(): Promise<void>;
  dismissPostGame(): void;
  advance(): Promise<void>;
  setFlag(key: string, value: boolean): void;

  loadRecruiting(): void;
  commit(name: string): Promise<void>;
  enterDraft(): Promise<void>;
  loadFreeAgency(): void;
  sign(offer: FaOffer): Promise<void>;
}

let toastSeq = 0;

export const useStore = create<Store>((set, get) => {
  /** Clone → mutate → commit → autosave. All game-state changes go through here. */
  function mutate<T>(fn: (draft: GameState) => T): T {
    const cur = get().game;
    if (!cur) throw new Error('No game loaded');
    const draft = structuredClone(cur);
    const out = fn(draft);
    draft.updatedAt = Date.now();
    set({ game: draft });
    void saveGame(draft).catch((e) => get().toast(`Autosave failed: ${(e as Error).message}`, 'bad'));
    return out;
  }

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
      set({ game: state, screen: 'game', tab: 'hub', scene: null, live: null, post: null, offers: {}, draft: null, phaseNarration: null, lastTraining: null });
      await saveGame(state);
    },

    closeCareer: () => set({ game: null, screen: 'title', scene: null, live: null, post: null }),

    /* ── weekly steps ── */

    train(focus) {
      const r = mutate((d) => doTraining(d, focus));
      set({ lastTraining: r });
      r.gains.forEach((g) => get().toast(`${g.key.toUpperCase()} +${g.delta}`, 'good'));
    },

    summerTrain(focuses) {
      const gains = mutate((d) => doSummerTraining(d, focuses));
      set({ lastTraining: { gains, energyDelta: 0, academicsDelta: 0, text: 'A summer of work changes your game.' } });
      gains.forEach((g) => get().toast(`${g.key.toUpperCase()} ${g.delta > 0 ? '+' : ''}${g.delta}`, g.delta > 0 ? 'good' : 'bad'));
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
      const res = await resolveScene(get().client, get().game!, sc.plan, sc.setup, choice);
      if (res.error) get().toast(`AI narration failed, using a template.`, 'bad');
      const applied = mutate((d) => {
        const rng = new RNG(d.rngState);
        const r = applyEffects(d, res.effects, `scene:${sc.plan.kind}`, SCENE_CAPS, rng);
        d.rngState = rng.state;
        d.story.log.push({ season: d.career.season, week: d.career.week, phase: d.career.phase, kind: sc.plan.kind, title: sc.setup!.title, summary: res.summary });
        if (d.story.log.length > 200) d.story.log.splice(0, d.story.log.length - 200);
        return r.applied;
      });
      set({ scene: { ...get().scene!, loading: false, resolution: { ...res, applied } } });
    },

    finishScene() {
      mutate((d) => completeScene(d));
      set({ scene: null });
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
      const report = mutate((d) => finishUserGame(d, live.sim, live.game));
      set({ live: null, post: { report, recap: null } });
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
      set({ post: { report, recap: { ...recap, applied } } });
    },

    dismissPostGame: () => set({ post: null }),

    async advance() {
      if (get().busy) return;
      set({ busy: true, lastTraining: null });
      try {
        const prevSeason = get().game!.career.season;
        const r = mutate((d) => advanceWeek(d));
        r.messages.forEach((m) => get().toast(m, m.startsWith('Award') || m.startsWith('CHAMP') ? 'award' : 'info'));
        if (r.seasonEnded) {
          const summary = await generateSeasonSummary(get().client, get().game!);
          mutate((d) => {
            d.story.seasonSummaries.push({ season: prevSeason, text: summary });
          });
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
        mutate((d) => {
          commitToCollege(d, name);
          d.story.log.push({ season: d.career.season, week: 0, phase: 'recruiting', kind: 'commitment', title: `Committed to ${name}`, summary: `You committed to ${name}.` });
        });
        set({ offers: {}, phaseNarration: text });
      } finally {
        set({ busy: false });
      }
    },

    async enterDraft() {
      set({ busy: true });
      try {
        const result = mutate((d) => runDraft(d));
        const g = get().game!;
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
      set({ offers: {}, phaseNarration: null });
    },
  };
});
