import { expect } from 'vitest';
import type { GameState, RatingKey, ServiceId } from '../state/schemas';
import { fullContext } from '../narrative/context';
import { pickScene } from '../narrative/scenes';
import { advanceWeek, commitToCollege, completeScene, createUserGameSim, doSummerTraining, doTraining, finishUserGame, freeAgencyOffers, recruitingOffers, runDraft, setGamePlan, signFreeAgent, userAthlete, withRng } from './career';
import { applyCombine, applyContestResult, availableEvents, playRound, runCombine, startContest } from './events';
import { buyService, servicesFor } from './finance';
import { PLANS } from './gameplan';
import type { TrainingFocus } from './progression';
import { recruitAct } from './recruiting';
import { lifeEventView, resolveLifeEvent } from './lifeEvents';
import { acceptOffer, answerPress } from './media';
import { executeMove, moveStatus, startMove, stayPut } from './moves';
import { RNG } from './rng';

/** Answers whatever random moment is waiting, with a random choice the player can afford. */
export function answerLife(s: GameState, rng: RNG) {
  const v = lifeEventView(s);
  if (!v) return;
  const ok = v.options.filter((o) => o.affordable);
  withRng(s, (r) => resolveLifeEvent(s, r, rng.pick(ok.length ? ok : v.options).id));
}

/** Sometimes look for a new team and take it or stay. */
export function tryMove(s: GameState, rng: RNG) {
  if (!moveStatus(s)?.can) return;
  withRng(s, (r) => startMove(s, r));
  const pm = s.career.pendingMove;
  if (!pm) return;
  if (rng.chance(0.6)) withRng(s, (r) => executeMove(s, r, rng.pick(pm.offers).teamId));
  else stayPut(s);
}

/** Plays one step with deliberately varied choices so every system gets exercised. */
export interface TickOptions {
  moves?: boolean;
  /** Picks this week's training focus. Return undefined to leave it to the autopilot's random choice. */
  train?: (s: GameState) => TrainingFocus | undefined;
  /** Picks the summer plan. */
  summer?: (s: GameState) => RatingKey[] | undefined;
  /** Extra shopping each training week. */
  shop?: (s: GameState) => void;
}

export function tick(s: GameState, rng: RNG, o: TickOptions = {}) {
  const c = s.career;
  // a random moment waiting for a decision comes first
  if (c.lifeEvent) {
    answerLife(s, rng);
    return;
  }
  switch (c.phase) {
    case 'recruiting':
      commitToCollege(s, recruitingOffers(s)[0].name);
      return;
    case 'draft': {
      // use the combine when offered
      if (availableEvents(s).some((e) => e.id === 'combine')) applyCombine(s, runCombine(s, rng.chance(0.5) ? 'push' : 'steady'));
      runDraft(s);
      return;
    }
    case 'free_agency':
      signFreeAgent(s, freeAgencyOffers(s)[0]);
      return;
    case 'retired':
      return;
  }
  if (c.step === 'training') {
    // work on a recruit now and then
    if (s.recruiting.targets.length && rng.chance(0.4)) withRng(s, (r) => recruitAct(s, r, rng.pick(s.recruiting.targets).athleteId, rng.pick(['call', 'visit', 'hype', 'perks'] as const)));
    if (rng.chance(0.15)) {
      const svc = rng.pick(servicesFor(s)).id as ServiceId;
      buyService(s, svc);
    }
    o.shop?.(s);
    if (c.phase === 'offseason') doSummerTraining(s, o.summer?.(s) ?? ['shooting', 'defense']);
    else {
      const own = o.train?.(s);
      const random: TrainingFocus = s.player.energy < 40 ? 'rest' : s.player.academics < 2.6 && c.level !== 'pro' ? 'study' : rng.pick(['shooting', 'finishing', 'defense', 'passing', 'study']);
      doTraining(s, own ?? random);
    }
    return;
  }
  if (c.step === 'scene') {
    // the scene picker must always produce something playable
    const plan = withRng(s, (r) => pickScene(s, r));
    expect(plan.kind.length).toBeGreaterThan(0);
    expect(plan.brief.length).toBeGreaterThan(5);
    expect(fullContext(s, plan.castIds).length).toBeGreaterThan(100);
    completeScene(s);
    return;
  }
  if (c.step === 'game') {
    // random plans, sometimes film, sometimes play hurt, sometimes enter an offer or a contest
    setGamePlan(s, rng.pick(PLANS).id, rng.chance(0.4));
    const g = createUserGameSim(s)!;
    for (let i = 0; i < 60; i++) {
      const st = g.sim.advance();
      if (st.type === 'final') break;
      if (st.type === 'moment') g.sim.resolveMoment(rng.pick(st.moment.options).id);
    }
    finishUserGame(s, g.sim, g.game);
    if (s.career.press) withRng(s, (r) => answerPress(s, r, rng.pick(['humble', 'bold', 'deflect'] as const)));
    return;
  }
  // wrap-up: sign offers, enter contests, maybe look for a new team
  for (const o2 of [...s.offers]) if (rng.chance(0.5)) withRng(s, (r) => acceptOffer(s, r, o2.id));
  for (const e of availableEvents(s)) {
    if (e.id === 'combine') continue;
    let ct = startContest(s, e.id);
    while (!ct.finished) ct = playRound(ct, 56, rng.pick(['safe', 'balanced', 'risky'] as const));
    applyContestResult(s, ct);
  }
  if (o.moves && rng.chance(0.35)) tryMove(s, rng);
  if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
  if (c.level === 'pro' && c.phase === 'offseason' && userAthlete(s).age >= 34) s.story.flags.retiring = true;
  advanceWeek(s);
}

/** Plays forward until a condition holds (or the career ends). */
export function playUntil(s: GameState, rng: RNG, done: (s: GameState) => boolean, o: TickOptions = {}, max = 20000) {
  let n = 0;
  while (!done(s) && s.career.phase !== 'retired' && n++ < max) tick(s, rng, o);
  return n;
}
