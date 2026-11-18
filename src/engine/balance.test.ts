import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../state/schemas';
import { advanceWeek, commitToCollege, completeScene, createCareer, createUserGameSim, doSummerTraining, doTraining, finishUserGame, freeAgencyOffers, recruitingOffers, runDraft, signFreeAgent, withRng } from './career';
import { coachStanding } from './coach';
import { applyCombine, applyContestResult, availableEvents, playRound, runCombine, startContest } from './events';
import { acceptOffer, answerPress } from './media';
import { RNG } from './rng';
import { overall } from './ratings';
import type { TrainingFocus } from './progression';
import { PRO_TAX_RATE } from './finance';

interface Stats {
  games: number;
  sat: number;
  press: number;
  offersSeen: number;
  signed: number;
  contests: number;
  badges: number;
  firstBadgeSeason: number;
  minTrust: number;
  maxTrust: number;
  minGpa: number;
  ineligibleWeeks: number;
  injuryHistory: number;
  money: number;
  feed: number;
  /** Game score scaled to 20 minutes, one per game played, for tuning the coach. */
  gs20: number[];
  endorse: number;
  followers: number;
  ovr: number;
  maxOffer: number;
}

/** Plays a career on autopilot the way a casual player might, and reports how the new systems behaved. */
function play(seed: number, studies: boolean): Stats {
  const s: GameState = createCareer({ firstName: 'Bal', lastName: 'Ance', hometown: 'X', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
  const rng = new RNG(seed);
  const st: Stats = { games: 0, sat: 0, press: 0, offersSeen: 0, signed: 0, contests: 0, badges: 0, firstBadgeSeason: 0, minTrust: 100, maxTrust: 0, minGpa: 4, ineligibleWeeks: 0, injuryHistory: 0, money: 0, feed: 0, gs20: [], endorse: 0, followers: 0, ovr: 0, maxOffer: 0 };
  let ticks = 0;
  while (s.career.phase !== 'retired' && ticks < 20000) {
    const c = s.career;
    if (c.phase === 'recruiting') commitToCollege(s, recruitingOffers(s)[0].name);
    else if (c.phase === 'draft') {
      applyCombine(s, runCombine(s, 'steady'));
      runDraft(s);
    } else if (c.phase === 'free_agency') signFreeAgent(s, freeAgencyOffers(s)[0]);
    else if (c.step === 'training') {
      if (c.phase === 'offseason') doSummerTraining(s, ['shooting', 'defense']);
      else {
        const focus: TrainingFocus = s.player.energy < 40 ? 'rest' : studies && s.player.academics < 2.7 && c.level !== 'pro' ? 'study' : rng.pick<TrainingFocus>(['shooting', 'finishing', 'defense', 'passing']);
        doTraining(s, focus);
      }
    } else if (c.step === 'scene') completeScene(s);
    else if (c.step === 'game') {
      if (s.player.injury && s.player.injury.weeks <= 2) s.career.playHurt = true;
      const g = createUserGameSim(s)!;
      g.sim.runToEnd();
      const r = finishUserGame(s, g.sim, g.game);
      st.games++;
      if (!r.line) st.sat++;
      else if (r.line.sec >= 600) st.gs20.push((r.gameScore * 1200) / r.line.sec);
      if (s.career.press) {
        st.press++;
        withRng(s, (rr) => answerPress(s, rr, 'humble'));
      }
      const co = coachStanding(s);
      st.minTrust = Math.min(st.minTrust, co.trust);
      st.maxTrust = Math.max(st.maxTrust, co.trust);
      st.minGpa = Math.min(st.minGpa, s.player.academics);
      if (s.player.badges.length && !st.firstBadgeSeason) st.firstBadgeSeason = s.career.season;
    } else {
      for (const o of [...s.offers]) {
        st.offersSeen++;
        st.maxOffer = Math.max(st.maxOffer, o.perSeason);
        if (withRng(s, (rr) => acceptOffer(s, rr, o.id))) st.signed++;
      }
      for (const e of availableEvents(s)) {
        if (e.id === 'combine') continue;
        let ct = startContest(s, e.id);
        while (!ct.finished) ct = playRound(ct, 56, 'balanced');
        applyContestResult(s, ct);
        st.contests++;
      }
      if (c.level === 'college' && c.phase === 'offseason' && c.year >= 3) s.story.flags.declared_for_draft = true;
      if (c.level === 'pro' && c.phase === 'offseason' && s.athletes[s.player.athleteId].age >= 34) s.story.flags.retiring = true;
      const adv = advanceWeek(s);
      for (const m of adv.messages) {
        const hit = /^Endorsements paid \$([\d,]+)/.exec(m);
        if (hit) st.endorse += Number(hit[1].replace(/,/g, ''));
      }
    }
    ticks++;
  }
  st.followers = s.player.followers;
  st.ovr = overall(s.athletes[s.player.athleteId].ratings);
  st.badges = s.player.badges.length;
  st.injuryHistory = s.player.injuryHistory;
  st.money = s.player.money;
  st.feed = s.feed.length;
  return st;
}

/**
 * Guardrails for how the new systems behave over whole careers. These bounds were set from measured runs
 * (see the numbers in the comments), with room to spare, so a future change that breaks the feel fails loudly.
 */
describe('balance over whole careers', () => {
  const seeds = [3, 12, 99, 2024];
  let runs: { seed: number; studies: boolean; r: Stats }[] = [];
  beforeAll(() => {
    runs = seeds.flatMap((seed) => [true, false].map((studies) => ({ seed, studies, r: play(seed, studies) })));
  }, 120_000);

  it('the coach keeps a middling player in the middle instead of burying them', () => {
    for (const { r } of runs) {
      // measured 22 to 77. It used to hit 0 for everyone.
      expect(r.minTrust).toBeGreaterThan(10);
    }
    // and good play does build trust for someone
    expect(Math.max(...runs.map((x) => x.r.maxTrust))).toBeGreaterThan(55);
  });

  it('endorsements stay a supplement, not the main income', () => {
    for (const { r } of runs) {
      // measured $23M to $82M against $145M to $325M total. It used to reach $340M on its own.
      // endorsements are counted before tax and the bank after it, so compare them the same way
      expect(r.endorse * (1 - PRO_TAX_RATE)).toBeLessThan(r.money * 0.5);
      expect(r.maxOffer).toBeLessThan(12_000_000);
      // measured 8 to 20 offers in a whole career
      expect(r.offersSeen).toBeLessThan(35);
    }
    expect(runs.some((x) => x.r.endorse > 0)).toBe(true);
  });

  it('injuries stay occasional and the body recovers between seasons', () => {
    // typically 0 to 3, with the occasional unlucky career well above that (one run in eight has ended on 8), so the guard
    // is on the average and on a ceiling rather than on every single career
    const h = runs.map((x) => x.r.injuryHistory);
    expect(h.reduce((a, b) => a + b, 0) / h.length).toBeLessThan(3);
    expect(Math.max(...h)).toBeLessThanOrEqual(10);
  });

  it('grades matter: ignore school and you sit games out, keep up with it and you play', () => {
    const studied = runs.filter((x) => x.studies);
    const ignored = runs.filter((x) => !x.studies);
    for (const { r } of studied) {
      expect(r.sat / r.games).toBeLessThan(0.05);
      expect(r.minGpa).toBeGreaterThanOrEqual(2.0);
    }
    for (const { r } of ignored) {
      expect(r.minGpa).toBeLessThan(2.0);
      expect(r.sat).toBeGreaterThan(0);
    }
  });

  it('badges are earned over a career, but not all handed out', () => {
    for (const { r } of runs) {
      expect(r.badges).toBeGreaterThanOrEqual(3);
      // there are nine, and they come in the second half of a career, not the first season
      expect(r.badges).toBeLessThanOrEqual(9);
      expect(r.firstBadgeSeason).toBeGreaterThanOrEqual(3);
    }
  });

  it('the world reacts: press, contests and a full feed all happen', () => {
    for (const { r } of runs) {
      expect(r.contests).toBeGreaterThan(0);
      expect(r.feed).toBeGreaterThan(20);
    }
    expect(runs.some((x) => x.r.press > 0)).toBe(true);
  });
});
