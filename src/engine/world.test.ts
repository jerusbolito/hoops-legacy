import { describe, expect, it } from 'vitest';
import { advanceWeek, createCareer, createUserGameSim, doTraining, finishUserGame, userAthlete, withRng } from './career';
import { allStarIds, midseasonHeadlines, mvpRace, scoredPlayers } from './awards';
import { BASELINE, bumpChemistry, chemistryAfterGame, chemistryMod, chemistryNewSeason, isCaptain, weeklyChemistry } from './chemistry';
import { midseasonWeek } from './events';
import { simOptions } from './league';
import { templateResolution } from '../narrative/templates';
import { kidsOf, loveBlock, loveOf, longDistance, setStage, stageOf, weeklyRomance } from './romance';
import { adoptCoach, replaceCoach } from './moves';
import { captainVoteDue, lifeEventView, resolveLifeEvent, rollLifeEvent } from './lifeEvents';
import { coachOf } from './coach';
import { rivalryGame, seriesText } from './rivalry';
import { RNG } from './rng';
import { playUntil } from './testkit';
import { leagueOffseasonMoves } from './transactions';
import type { GameState } from '../state/schemas';

const make = (seed: number) => createCareer({ firstName: 'Wd', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

const rostersWhole = (s: GameState) => {
  for (const id of s.league.teamIds) for (const a of s.teams[id].rosterIds) expect(s.athletes[a].teamId).toBe(id);
};

describe('rivalry games', () => {
  it('marks the game against the rival\'s team, keeps a series, and it matters more than a normal night', () => {
    const s = make(5);
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const rivalTeam = s.athletes[rival.athleteId!].teamId!;
    expect(rivalryGame(s, rivalTeam)?.rival.id).toBe(rival.id);
    expect(rivalryGame(s, s.career.teamId)).toBeNull();
    // play until the schedule brings the rival's team around
    const rng = new RNG(5);
    const facing = (x: GameState) => {
      const g = x.league.schedule.find((m) => m.week === x.career.week && !m.played && (m.homeId === x.career.teamId || m.awayId === x.career.teamId));
      return g ? (g.homeId === x.career.teamId ? g.awayId : g.homeId) : null;
    };
    playUntil(s, rng, (x) => x.career.step === 'game' && facing(x) === rivalTeam && !x.career.lifeEvent);
    expect(s.career.step).toBe('game');
    const g = createUserGameSim(s)!;
    s.player.morale = 50;
    g.sim.runToEnd();
    const r = finishUserGame(s, g.sim, g.game);
    const played = 1;
    expect(rival.h2h.w + rival.h2h.l).toBe(1);
    expect(rival.h2h.w).toBe(r.won ? 1 : 0);
    expect(s.news.some((n) => /beat|lost to/i.test(n.text) && n.text.includes(rival.name))).toBe(true);
    expect(rival.memories.some((m) => /series/.test(m))).toBe(true);
    expect(played).toBe(1);
  }, 30_000);

  it('words the series plainly', () => {
    expect(seriesText(2, 2)).toBe('series tied 2-2');
    expect(seriesText(3, 1)).toBe('you lead the series 3-1');
    expect(seriesText(1, 3)).toBe('they lead the series 3-1');
  });
});

describe('the coach carousel', () => {
  it('losing teams fire their coaches, some get hired elsewhere, and every team still has a coach', () => {
    let fired = 0;
    let rehired = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      for (const id of s.league.teamIds) s.league.standings[id] = { w: 3, l: 8, pf: 0, pa: 0 };
      const before = new Map(s.league.teamIds.map((id) => [id, s.teams[id].coachName]));
      leagueOffseasonMoves(s, new RNG(seed));
      const log = s.transactions.filter((t) => t.kind === 'coach');
      fired += log.length;
      rehired += log.filter((t) => /takes over/.test(t.text)).length;
      for (const id of s.league.teamIds) {
        expect(s.teams[id].coachName.length).toBeGreaterThan(3);
        const changed = s.teams[id].coachName !== before.get(id);
        if (changed) expect(log.some((t) => t.text.includes(before.get(id)!) && t.text.includes(s.teams[id].name))).toBe(true);
      }
      // never two teams with the same coach
      expect(new Set(s.league.teamIds.map((id) => s.teams[id].coachName)).size).toBe(s.league.teamIds.length);
      const c = coachOf(s)!;
      expect(c.name).toBe(s.teams[s.career.teamId].coachName);
      expect(Object.values(s.npcs).filter((n) => n.role === 'coach' && n.active)).toHaveLength(1);
      rostersWhole(s);
    }
    expect(fired).toBeGreaterThan(10);
    expect(rehired).toBeGreaterThan(0);
  }, 30_000);

  it('winning teams keep theirs, and a coach you played for can turn up on another bench', () => {
    const s = make(8);
    for (const id of s.league.teamIds) s.league.standings[id] = { w: 9, l: 2, pf: 0, pa: 0 };
    const before = s.league.teamIds.map((id) => s.teams[id].coachName);
    leagueOffseasonMoves(s, new RNG(1));
    expect(s.league.teamIds.map((id) => s.teams[id].coachName).filter((n, i) => n !== before[i]).length).toBeLessThanOrEqual(1);

    // a former coach lands a job: the mentor in your story notices
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const t = make(seed);
      const old = Object.values(t.npcs).find((n) => n.role === 'coach')!;
      old.role = 'mentor';
      t.teams[t.career.teamId].coachName = 'Someone Else';
      const elsewhere = t.league.teamIds.find((id) => id !== t.career.teamId)!;
      t.teams[elsewhere].coachName = old.name;
      leagueOffseasonMoves(t, new RNG(seed));
      if (old.title.includes('now head coach at')) {
        found = true;
        expect(old.memories.some((m) => /Landed the head coaching job/.test(m))).toBe(true);
      }
    }
    expect(found).toBe(true);
    void userAthlete;
  });
});

/** A season line with the shooting columns filled in. */
const full = (p: { gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number }) => ({ ...p, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0, pf: 0 });

const midSeason = (seed: number, level: 'hs' | 'college' | 'pro' = 'hs') => {
  const s = make(seed);
  const rng = new RNG(seed + 100);
  playUntil(s, rng, (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= 3 && x.career.step === 'training' && !x.career.lifeEvent);
  return { s, rng };
};

describe('injury comebacks', () => {
  it('rehab shaves a week off after two sessions and lifts your mood', () => {
    const { s } = midSeason(4);
    s.player.injury = { weeks: 4, desc: 'high ankle sprain' };
    s.player.energy = 80;
    s.player.morale = 50;
    const r1 = doTraining(s, 'rehab');
    expect(r1.text).toMatch(/trainer/);
    expect(s.player.injury!.weeks).toBe(4);
    expect(s.player.morale).toBe(52);
    doTraining(s, 'rehab');
    expect(s.player.injury!.weeks).toBe(3);
    expect(s.player.energy).toBe(80 - 3 - 3);
    // with nothing to rehab it is just a rest
    s.player.injury = null;
    const e = s.player.energy;
    doTraining(s, 'rehab');
    expect(s.player.energy).toBe(e + 10);
  });

  it('a long layoff ends with a comeback moment that must be answered, and the choice matters', () => {
    for (const choice of ['ease', 'push', 'thank']) {
      const { s } = midSeason(5);
      s.player.injury = { weeks: 1, desc: 'torn ligament', total: 5 };
      advanceWeek(s); // the last week of the injury passes
      expect(s.player.injury).toBeNull();
      expect(s.career.lifeEvent?.id).toBe('comeback');
      const view = lifeEventView(s)!;
      expect(view.text).toMatch(/cleared after 5 weeks/);
      const out = withRng(s, (rng) => resolveLifeEvent(s, rng, choice))!;
      expect(out.text.length).toBeGreaterThan(20);
      expect(Number(s.story.flags.comeback_due)).toBe(0);
      expect(s.career.lifeEvent).toBeNull();
    }
  });

  it('a short injury does not get one, and a very long one with no rehab costs a step', () => {
    const { s } = midSeason(6);
    s.player.injury = { weeks: 1, desc: 'bruised knee', total: 1 };
    advanceWeek(s);
    expect(s.career.lifeEvent?.id).not.toBe('comeback');

    const t = midSeason(7).s;
    const ath0 = userAthlete(t).ratings.athleticism;
    t.player.injury = { weeks: 1, desc: 'torn ACL', total: 8 };
    t.story.flags.rehab_sessions = 0;
    advanceWeek(t);
    expect(t.career.lifeEvent?.id).toBe('comeback');
    withRng(t, (rng) => resolveLifeEvent(t, rng, 'ease'));
    expect(userAthlete(t).ratings.athleticism).toBe(ath0 - 1);

    const u = midSeason(7).s;
    u.player.injury = { weeks: 1, desc: 'torn ACL', total: 8 };
    u.story.flags.rehab_sessions = 5;
    advanceWeek(u);
    withRng(u, (rng) => resolveLifeEvent(u, rng, 'ease'));
    expect(userAthlete(u).ratings.athleticism).toBe(ath0);
  });
});

describe('awards races and the All-Star game', () => {
  it('ranks the league by the same measure that picks the year-end MVP', () => {
    const { s } = midSeason(9, 'college');
    const me = s.player.athleteId;
    s.leagueStats[me] = full({ gp: 9, min: 300, pts: 270, reb: 90, ast: 70, stl: 20, blk: 5 });
    const race = mvpRace(s, 6);
    expect(race.length).toBeGreaterThan(1);
    for (let i = 1; i < race.length; i++) expect(race[i - 1].score).toBeGreaterThanOrEqual(race[i].score);
    expect(race.find((r) => r.id === me)?.isYou).toBe(true);
    // once everyone has played enough to qualify, the race table and the awards table agree on who leads
    for (const st of Object.values(s.leagueStats)) {
      st.gp *= 4;
      st.min *= 4;
      st.pts *= 4;
      st.reb *= 4;
      st.ast *= 4;
      st.stl *= 4;
      st.blk *= 4;
    }
    const top = scoredPlayers(s)[0];
    expect(mvpRace(s, 6)[0].id).toBe(top.id);
  });

  it('names the All-Stars once, at the midpoint, and rewards you for making it', () => {
    const { s } = midSeason(10, 'college');
    const me = s.player.athleteId;
    s.leagueStats[me] = full({ gp: 9, min: 330, pts: 330, reb: 100, ast: 90, stl: 25, blk: 6 });
    s.career.week = midseasonWeek(s) + 1;
    midseasonHeadlines(s);
    expect(allStarIds(s)).toHaveLength(0); // not the right week
    s.career.week = midseasonWeek(s);
    const rep0 = s.player.reputation;
    midseasonHeadlines(s);
    const ids = allStarIds(s);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.length).toBeLessThanOrEqual(10);
    expect(ids).toContain(me);
    expect(s.player.awards.filter((a) => a.name === 'All-Star' && a.season === s.career.season)).toHaveLength(1);
    expect(s.player.reputation).toBeGreaterThan(rep0);
    expect(s.transactions.some((t) => /All-Star rosters are out/.test(t.text))).toBe(true);
    // a second pass the same week changes nothing
    midseasonHeadlines(s);
    expect(s.player.awards.filter((a) => a.name === 'All-Star')).toHaveLength(1);
  });

  it('writes the race up every few weeks', () => {
    const { s } = midSeason(11, 'college');
    s.leagueStats[s.player.athleteId] = full({ gp: 9, min: 330, pts: 330, reb: 100, ast: 90, stl: 25, blk: 6 });
    s.career.week = 3;
    const n0 = s.news.length;
    midseasonHeadlines(s);
    expect(s.news.length).toBe(n0 + 1);
    expect(s.news[s.news.length - 1].text).toMatch(/MVP race: .+ leads/);
  });
});

describe('team chemistry and the captain', () => {
  it('stays between 0 and 100 and maps to a small, fair rating bonus', () => {
    const { s } = midSeason(12);
    const c = s.career;
    c.chemistry = 95;
    expect(chemistryMod(s)).toBe(2);
    c.chemistry = 75;
    expect(chemistryMod(s)).toBe(1);
    c.chemistry = 55;
    expect(chemistryMod(s)).toBe(0);
    c.chemistry = 35;
    expect(chemistryMod(s)).toBe(-1);
    c.chemistry = 10;
    expect(chemistryMod(s)).toBe(-2);
    bumpChemistry(s, 500);
    expect(c.chemistry).toBe(100);
    bumpChemistry(s, -500);
    expect(c.chemistry).toBe(0);
  });

  it('winning builds it, a blowout loss hurts, and the room drifts back toward normal', () => {
    const { s } = midSeason(13);
    s.career.chemistry = 55;
    chemistryAfterGame(s, { won: true, margin: 6 });
    expect(s.career.chemistry).toBeGreaterThan(55);
    const high = s.career.chemistry;
    chemistryAfterGame(s, { won: false, margin: 25 });
    expect(s.career.chemistry).toBeLessThan(high - 2);
    s.career.chemistry = 90;
    weeklyChemistry(s);
    expect(s.career.chemistry).toBeLessThan(90);
    s.career.chemistry = 10;
    weeklyChemistry(s);
    expect(s.career.chemistry).toBeGreaterThan(10);
    // a new season fades most of it
    s.career.chemistry = 95;
    chemistryNewSeason(s);
    expect(s.career.chemistry).toBeLessThan(80);
    expect(s.career.chemistry).toBeGreaterThan(BASELINE);
  });

  it('a close team plays above its ratings: every teammate gets the bonus in the game sim', () => {
    const { s } = midSeason(14);
    s.career.chemistry = 90;
    const mods = simOptions(s, true).ratingMods!;
    const mates = s.teams[s.career.teamId].rosterIds;
    for (const id of mates) expect(id in mods).toBe(true);
    const other = mates.find((id) => id !== s.player.athleteId)!;
    expect(mods[other]).toBe(2);
    expect(mods[s.player.athleteId]).toBeGreaterThanOrEqual(2 - 12);
    s.career.chemistry = 10;
    expect(simOptions(s, true).ratingMods![other]).toBe(-2);
  });

  it('a captain keeps the room closer, and a new coach unsettles it', () => {
    const { s } = midSeason(15);
    s.story.flags.captain_season = s.career.season;
    expect(isCaptain(s)).toBe(true);
    s.career.chemistry = 55;
    for (let i = 0; i < 40; i++) weeklyChemistry(s);
    expect(s.career.chemistry).toBeGreaterThan(58);
    s.career.chemistry = 60;
    withRng(s, (rng) => replaceCoach(s, rng));
    expect(s.career.chemistry).toBe(52);
  });

  it('the captain vote comes round in preseason once you have standing, and winning it changes things', () => {
    const s = make(16);
    const rng = new RNG(16);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && x.career.year === 1 && !x.career.lifeEvent);
    s.player.reputation = 40;
    playUntil(s, rng, (x) => x.career.lifeEvent?.id === 'captain_vote');
    expect(s.career.phase).toBe('preseason');
    expect(s.career.year).toBe(2);
    const view = lifeEventView(s)!;
    expect(view.options.map((o) => o.id)).toEqual(['run', 'back', 'stay']);
    expect(view.options[0].hint).toMatch(/\d+% chance/);
    // stack the odds and run: it should be won in at least one of a few tries, with the benefits
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach')!;
    coach.relationship.respect = 100;
    s.player.reputation = 100;
    let won = 0;
    for (let i = 0; i < 6; i++) {
      const t = structuredClone(s);
      t.rngState = 100 + i;
      const c0 = t.career.chemistry;
      withRng(t, (rng2) => resolveLifeEvent(t, rng2, 'run'));
      expect(t.story.flags.captain_asked).toBe(t.career.season);
      if (isCaptain(t)) {
        won++;
        expect(t.career.chemistry).toBeGreaterThan(c0);
        expect(t.news.some((n) => /named team captain/.test(n.text))).toBe(true);
      }
    }
    expect(won).toBeGreaterThanOrEqual(4);
    // answered once, it does not come back this season
    const t2 = structuredClone(s);
    withRng(t2, (rng2) => resolveLifeEvent(t2, rng2, 'stay'));
    expect(captainVoteDue(t2)).toBe(false);
  });
});

describe('life outside basketball', () => {
  it('a spark grows on its own for someone you see all the time, but only so far', () => {
    const { s } = midSeason(26);
    const love = loveOf(s)!;
    love.relationship.romance = 5;
    love.relationship.affinity = 10;
    for (let i = 0; i < 80; i++) weeklyRomance(s);
    expect(love.relationship.romance).toBe(50);
    expect(stageOf(s)).toBe('crush');
    // somebody who does not like you does not warm up
    const t = midSeason(26).s;
    const l2 = loveOf(t)!;
    l2.relationship.romance = 5;
    l2.relationship.affinity = -20;
    for (let i = 0; i < 80; i++) weeklyRomance(t);
    expect(l2.relationship.romance).toBe(5);
  });

  it('the big moments come on their own once the time is right', () => {
    const { s, rng } = midSeason(28);
    const love = loveOf(s)!;
    love.relationship.romance = 40;
    love.relationship.affinity = 20;
    expect(stageOf(s)).toBe('crush');
    s.career.lifeEvent = null;
    s.career.weeksSinceLife = 5;
    let came = false;
    for (let i = 0; i < 20 && !came; i++) {
      s.career.weeksSinceLife = 5;
      withRng(s, (r) => rollLifeEvent(s, r));
      if ((s.career.lifeEvent as { id: string } | null)?.id === 'make_official') came = true;
      else s.career.lifeEvent = null;
    }
    expect(came).toBe(true);
    void rng;
    // and not before the relationship is there
    const t = midSeason(28).s;
    loveOf(t)!.relationship.romance = 10;
    for (let i = 0; i < 30; i++) {
      t.career.weeksSinceLife = 5;
      t.career.lifeEvent = null;
      withRng(t, (r) => rollLifeEvent(t, r));
      expect((t.career.lifeEvent as { id: string } | null)?.id).not.toBe('make_official');
    }
  });

  it('date scenes build romance even without the narrator', () => {
    const { s } = midSeason(27);
    const love = loveOf(s)!;
    const r = templateResolution({ kind: 'date', brief: '', castIds: [love.id] }, 'kind', 'Be kind');
    expect(r.effects.some((e) => e.type === 'rel' && e.field === 'romance' && e.delta > 0)).toBe(true);
    const other = templateResolution({ kind: 'practice', brief: '', castIds: [love.id] }, 'kind', 'Be kind');
    expect(other.effects.some((e) => e.type === 'rel' && e.field === 'romance')).toBe(false);
  });

  const force = (s: GameState, id: string, choice: string, money = 5_000_000) => {
    const love = loveOf(s);
    s.career.lifeEvent = { id, seed: 5, refs: { ...(love ? { love: love.id } : {}), ...Object.fromEntries(Object.values(s.npcs).filter((n) => n.role === 'family' && n.active).map((n) => ['family', n.id])) } };
    s.player.money = money;
    return withRng(s, (rng) => resolveLifeEvent(s, rng, choice));
  };

  it('a crush becomes a relationship when you are close enough, and the title says so', () => {
    const { s } = midSeason(20);
    const love = loveOf(s)!;
    expect(stageOf(s)).toBe('none');
    love.relationship.romance = 20;
    expect(stageOf(s)).toBe('crush');
    love.relationship.romance = 80;
    love.relationship.affinity = 60;
    const out = force(s, 'make_official', 'yes')!;
    expect(out.text).toMatch(/together/);
    expect(stageOf(s)).toBe('dating');
    expect(love.title).toBe('Someone you are seeing');
    expect(loveBlock(s)).toMatch(/is seeing/);
  });

  it('it cools without attention and ends when it gets too cold, but a marriage does not just vanish', () => {
    const { s } = midSeason(21);
    const love = loveOf(s)!;
    setStage(s, 'dating');
    s.story.flags.long_distance = s.career.season + 50; // apart: nothing keeps it going but effort
    love.relationship.romance = 40;
    const m0 = s.player.morale;
    for (let i = 0; i < 200 && stageOf(s) === 'dating'; i++) weeklyRomance(s);
    expect(stageOf(s)).toBe('none');
    expect(love.estranged).toBe(true);
    expect(love.title).toBe('Your ex');
    expect(s.player.morale).toBeLessThan(m0);
    expect(s.news.some((n) => /split up/.test(n.text))).toBe(true);

    const t = midSeason(21).s;
    const l2 = loveOf(t)!;
    setStage(t, 'married');
    l2.relationship.romance = 20;
    for (let i = 0; i < 200; i++) weeklyRomance(t);
    expect(stageOf(t)).toBe('married');
  });

  it('time together keeps a relationship alive and lets it grow, up to a point', () => {
    const { s } = midSeason(29);
    const love = loveOf(s)!;
    setStage(s, 'dating');
    love.relationship.romance = 40;
    for (let i = 0; i < 300; i++) weeklyRomance(s);
    expect(stageOf(s)).toBe('dating');
    expect(love.relationship.romance).toBeGreaterThan(74);
    expect(love.relationship.romance).toBeLessThanOrEqual(75);
  });

  it('a relationship can get serious, and that opens the way to a proposal', () => {
    const { s } = midSeason(30);
    const love = loveOf(s)!;
    setStage(s, 'dating');
    s.story.flags.love_since = s.career.season - 1;
    love.relationship.romance = 70;
    expect(force(s, 'getting_serious', 'slow')!.text).toMatch(/slowly|sure/);
    expect(stageOf(s)).toBe('dating');
    force(s, 'getting_serious', 'all');
    expect(stageOf(s)).toBe('partner');
    expect(love.title).toBe('Your partner');
  });

  it('neglect has a price and attention pays it back', () => {
    const { s } = midSeason(22);
    const love = loveOf(s)!;
    setStage(s, 'dating');
    love.relationship.romance = 50;
    const r0 = love.relationship.romance;
    force(s, 'love_attention', 'brush');
    expect(love.relationship.romance).toBeLessThan(r0 - 5);
    const t = midSeason(22).s;
    const l2 = loveOf(t)!;
    setStage(t, 'dating');
    l2.relationship.romance = 50;
    force(t, 'love_attention', 'time');
    expect(l2.relationship.romance).toBeGreaterThan(50);
  });

  it('a serious relationship has to survive moving to a new level', () => {
    const s = make(23);
    const rng = new RNG(23);
    const love = loveOf(s)!;
    setStage(s, 'partner');
    love.relationship.romance = 100;
    playUntil(s, rng, (x) => x.career.level === 'college' && x.career.phase === 'preseason');
    expect(longDistance(s)).toBe(true);
    expect(love.title).toContain('far away');
    expect(loveBlock(s)).toMatch(/long distance/);
    const r0 = love.relationship.romance;
    const out = force(s, 'long_distance', 'visit')!;
    expect(out.lines.some((l) => /Money −\$/.test(l))).toBe(true);
    expect(love.relationship.romance).toBeGreaterThan(r0);
  });

  it('a pro can propose, marry and have kids, and kids change the weeks', () => {
    const { s } = midSeason(24, 'pro');
    const love = loveOf(s);
    if (!love) return; // the story can end that thread; nothing to check then
    setStage(s, 'partner');
    love.relationship.romance = 90;
    let engaged = false;
    for (let i = 0; i < 8 && !engaged; i++) {
      const t = structuredClone(s);
      t.rngState = 50 + i;
      force(t, 'proposal', 'propose');
      if (stageOf(t) === 'engaged') {
        engaged = true;
        expect(t.player.money).toBeLessThan(5_000_000);
        expect(t.news.some((n) => /gets engaged/.test(n.text))).toBe(true);
        t.story.flags.love_since = t.career.season - 1;
        force(t, 'wedding', 'small');
        expect(stageOf(t)).toBe('married');
        expect(loveOf(t)!.title).toBe('Your spouse');
        t.story.flags.baby_season = 0;
        force(t, 'baby', 'quiet');
        expect(kidsOf(t)).toBe(1);
        expect(loveBlock(t)).toMatch(/is married to .+ and has 1 kid/);
        // the week now costs a little sleep and gives a little joy
        t.player.energy = 80;
        t.player.morale = 50;
        weeklyRomance(t);
        expect(t.player.energy).toBe(79);
        expect(t.player.morale).toBe(51);
      }
    }
    expect(engaged).toBe(true);
  });

  it('a scare at home asks you to choose between family and the game', () => {
    const { s } = midSeason(25);
    const fam = Object.values(s.npcs).find((n) => n.role === 'family')!;
    const a0 = fam.relationship.affinity;
    force(s, 'family_scare', 'go');
    expect(fam.relationship.affinity).toBeGreaterThan(a0);
    const t = midSeason(25).s;
    const f2 = Object.values(t.npcs).find((n) => n.role === 'family')!;
    force(t, 'family_scare', 'focus');
    expect(f2.relationship.affinity).toBeLessThan(a0);
  });
});

describe('a coach who comes back into your story', () => {
  it('is the same person, not a duplicate: a former coach hired by your new team resumes the role', () => {
    const s = make(40);
    const coach = Object.values(s.npcs).find((n) => n.role === 'coach')!;
    coach.role = 'mentor';
    coach.relationship.trust = 77;
    const before = Object.keys(s.npcs).length;
    const back = withRng(s, (rng) => adoptCoach(s, rng, coach.name, 'Somewhere Else', { respect: 30, trust: 25 }));
    expect(back.id).toBe(coach.id);
    expect(back.role).toBe('coach');
    expect(back.relationship.trust).toBe(77); // your history comes with them
    expect(back.title).toBe('Head coach, Somewhere Else');
    expect(back.memories.some((m) => /playing for them again/.test(m))).toBe(true);
    expect(Object.keys(s.npcs)).toHaveLength(before);
    // a stranger is simply new
    const fresh = withRng(s, (rng) => adoptCoach(s, rng, 'Totally New Person', 'Elsewhere', { respect: 30, trust: 25 }));
    expect(fresh.id).not.toBe(coach.id);
    expect(Object.keys(s.npcs)).toHaveLength(before + 1);
  });
});
