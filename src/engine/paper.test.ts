import { describe, expect, it } from 'vitest';
import { GameStateSchema, IssueSchema, type GameState, type Level } from '../state/schemas';
import { athleteCard } from './athleteCard';
import { createCareer, userAthlete } from './career';
import { STAT_DEFS, fmtStat, gamesSoFar, leaders, perGame, qualifies, rankOf } from './leaders';
import { publishIssue } from './paper';
import { RNG } from './rng';
import { playUntil, tick } from './testkit';

const make = (seed: number) => createCareer({ firstName: 'Pp', lastName: `Test${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });

function midSeason(seed: number, level: Level = 'hs', week = 5): GameState {
  const s = make(seed);
  playUntil(s, new RNG(seed + 3), (x) => x.career.level === level && x.career.phase === 'regular' && x.career.week >= week && x.career.step === 'training' && !x.career.lifeEvent);
  return s;
}

describe('every box-score column is kept for everyone', () => {
  it('shooting, rebounds and turnovers add up for each player, and match the standings', () => {
    const s = midSeason(1);
    let games = 0;
    for (const st of Object.values(s.leagueStats)) {
      if (st.gp <= 0) continue;
      games++;
      expect(st.fgm).toBeLessThanOrEqual(st.fga);
      expect(st.tpm).toBeLessThanOrEqual(st.tpa);
      expect(st.ftm).toBeLessThanOrEqual(st.fta);
      expect(st.orb + st.drb).toBe(st.reb);
      // points are made of threes, twos and free throws
      expect(st.pts).toBe(2 * (st.fgm - st.tpm) + 3 * st.tpm + st.ftm);
    }
    expect(games).toBeGreaterThan(60);
  });
});

describe('league leaders', () => {
  it('rank every category best first, with the right flags and formats', () => {
    const s = midSeason(2);
    for (const def of STAT_DEFS) {
      const rows = leaders(s, def.key, 10);
      expect(rows.length, def.key).toBeGreaterThan(0);
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].value, def.key).toBeGreaterThanOrEqual(rows[i].value);
      // ranks never skip backwards, and the first place is first
      expect(rows[0].rank).toBe(1);
      for (let i = 1; i < rows.length; i++) expect(rows[i].rank).toBeGreaterThanOrEqual(rows[i - 1].rank);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      if (def.pct) for (const r of rows) expect(r.value).toBeLessThanOrEqual(1);
      expect(rows[0].display).toBe(fmtStat(def.key, rows[0].value));
      expect(rows[0].display).not.toMatch(/NaN|undefined/);
    }
    // the player is flagged where they appear
    const all = leaders(s, 'ppg', 200);
    const me = all.find((r) => r.id === s.player.athleteId);
    if (me) expect(me.isYou).toBe(true);
  });

  it('keep a hot-shooting bench player out of the shooting leaders until they have taken enough shots', () => {
    const s = midSeason(3);
    const id = Object.keys(s.leagueStats).find((k) => s.leagueStats[k].gp >= 3 && s.athletes[k])!;
    s.leagueStats[id] = { ...s.leagueStats[id], fgm: 4, fga: 4, tpm: 2, tpa: 2, ftm: 2, fta: 2 };
    expect(qualifies(s, s.leagueStats[id], 'fgPct')).toBe(false);
    expect(leaders(s, 'fgPct', 50).some((r) => r.id === id)).toBe(false);
    expect(rankOf(s, id, 'fgPct')).toBeNull();
    // but a regular who is just as accurate does count
    s.leagueStats[id] = { ...s.leagueStats[id], fgm: 90, fga: 90, tpm: 30, tpa: 30, ftm: 40, fta: 40 };
    expect(rankOf(s, id, 'fgPct')).toBe(1);
    expect(leaders(s, 'fgPct', 5)[0].id).toBe(id);
  });

  it('look like a real league: no one takes half the team\'s shots, and the best scorer is a believable number', () => {
    for (const [level, cap] of [['hs', 32], ['college', 34]] as const) {
      const s = make(30);
      playUntil(s, new RNG(30), (x) => x.career.level === level && x.career.phase === 'offseason' && !x.career.lifeEvent);
      const top = leaders(s, 'ppg', 1)[0];
      expect(top.value, level).toBeLessThan(cap);
      // a scorer's share of their team's points over the season
      const team = s.league.standings[top.teamId];
      const share = (top.value * top.gp) / Math.max(1, team.pf);
      expect(share, level).toBeLessThan(0.45);
      // and the fifth-best scorer is a real contributor too, not a rounding error
      expect(leaders(s, 'ppg', 5)[4].value, level).toBeGreaterThan(12);
    }
  }, 30_000);

  it('say how far into the season the league is, and rankOf agrees with the list', () => {
    const s = midSeason(4);
    expect(gamesSoFar(s)).toBeGreaterThanOrEqual(3);
    const rows = leaders(s, 'apg', 5);
    for (const r of rows) expect(rankOf(s, r.id, 'apg')).toBe(r.rank);
    const p = perGame(s.leagueStats[rows[0].id]);
    expect(p.apg).toBeCloseTo(rows[0].value, 6);
  });
});

describe('the player card', () => {
  it('shows anyone in the league: bio, ratings against yours, season line, ranks and tags', () => {
    const s = midSeason(5);
    const rival = Object.values(s.npcs).find((n) => n.role === 'rival')!;
    const card = athleteCard(s, rival.athleteId!)!;
    expect(card.name).toBe(rival.name);
    expect(card.tags).toContain('Rival');
    expect(card.ratings).toHaveLength(9);
    const mine = userAthlete(s);
    for (const r of card.ratings) expect(r.vsYou).toBe(r.value - mine.ratings[r.key as keyof typeof mine.ratings]);
    expect(card.team?.name).toBeTruthy();
    expect(card.contract).toBeNull(); // not a pro
    expect(card.classText).toMatch(/Freshman|Sophomore|Junior|Senior/);
    expect(card.height).toMatch(/\d/);
    if (card.season) {
      expect(card.season.gp).toBeGreaterThan(0);
      expect(Object.keys(card.ranks)).toContain('ppg');
    }
    expect(athleteCard(s, 'nobody')).toBeNull();
  });

  it('the player\'s own card has the career, recent games and a You tag', () => {
    const s = midSeason(6);
    const card = athleteCard(s, s.player.athleteId)!;
    expect(card.isYou).toBe(true);
    expect(card.tags).toContain('You');
    expect(card.career!.gp).toBeGreaterThan(0);
    expect(card.recent.length).toBeGreaterThan(0);
    expect(card.recent.length).toBeLessThanOrEqual(6);
    for (const g of card.recent) expect(g.line).toMatch(/pts, \d+ reb, \d+ ast/);
    expect(card.ratings.every((r) => r.vsYou === 0)).toBe(true);
  });

  it('pros show a contract, and last season is remembered after the turn', () => {
    const s = midSeason(7, 'pro', 3);
    const other = Object.values(s.athletes).find((a) => a.teamId === s.career.teamId && a.id !== s.player.athleteId)!;
    const card = athleteCard(s, other.id)!;
    expect(card.contract!.salary).toBeGreaterThan(1_000_000);
    expect(athleteCard(s, s.player.athleteId)!.contract!.years).toBe(s.player.contract!.yearsLeft);
    expect(!card.prev || card.prev.season <= s.career.season).toBe(true);
    // play out the season: everyone who played gets a last-season line
    const seasonNow = s.career.season;
    playUntil(s, new RNG(9), (x) => x.career.season > seasonNow && !x.career.lifeEvent);
    const withPrev = Object.values(s.athletes).filter((a) => a.prev && a.prev.season === seasonNow);
    expect(withPrev.length).toBeGreaterThan(50);
    for (const a of withPrev.slice(0, 20)) {
      expect(a.prev!.gp).toBeGreaterThan(0);
      expect(a.prev!.ppg).toBeGreaterThanOrEqual(0);
      expect(a.prev!.fgPct).toBeLessThanOrEqual(1);
    }
    const later = athleteCard(s, withPrev[0].id);
    if (later) expect(later.prev?.season).toBe(seasonNow);
  }, 30_000);
});

describe('the weekly paper', () => {
  it('prints a preview before the season, an edition every week, and a recap at the end', () => {
    const s = make(10);
    const rng = new RNG(10);
    playUntil(s, rng, (x) => x.career.phase === 'offseason' && !x.career.lifeEvent);
    const kinds = s.paper.map((i) => i.kind);
    expect(kinds[0]).toBe('preview');
    expect(kinds.filter((k) => k === 'weekly').length).toBe(s.league.regularWeeks);
    expect(kinds[kinds.length - 1]).toBe('recap');
    const ids = s.paper.map((i) => i.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of s.paper) {
      expect(() => IssueSchema.parse(i)).not.toThrow();
      expect(i.headline.length).toBeGreaterThan(8);
      expect(JSON.stringify(i)).not.toMatch(/NaN|undefined|\[object|null/);
    }
  });

  it('is true to the week: the scoreboard is every game played, the headline is your game, the numbers are the box score', () => {
    const s = midSeason(11, 'hs', 4);
    const issue = s.paper.filter((i) => i.kind === 'weekly').pop()!;
    const week = issue.week;
    const played = s.league.schedule.filter((g) => g.week === week && g.played);
    expect(issue.scoreboard).toHaveLength(played.length);
    for (const row of issue.scoreboard) {
      const g = played.find((q) => s.teams[q.homeId].name === row.home && s.teams[q.awayId].name === row.away)!;
      expect(g).toBeDefined();
      expect(row.hs).toBe(g.homeScore);
      expect(row.as).toBe(g.awayScore);
    }
    expect(issue.scoreboard.filter((r) => r.you)).toHaveLength(1);
    const myName = s.teams[s.career.teamId].name;
    expect(issue.headline + issue.deck).toContain(myName);
    // the first performer's numbers are in the leaders' own season log
    const perf = issue.sections.find((x) => x.id === 'performers')!;
    expect(perf.items.length).toBeGreaterThanOrEqual(2);
    expect(perf.items[0].people[0].id in s.leagueStats).toBe(true);
    expect(issue.standings.length).toBeGreaterThanOrEqual(5);
    expect(issue.standings.filter((r) => r.you).length).toBeGreaterThanOrEqual(1);
    expect(issue.leaders.length).toBeGreaterThanOrEqual(3);
  });

  it('clears the week once it is printed, and never touches the game\'s random numbers', () => {
    const s = midSeason(12, 'hs', 4);
    expect(s.weekLog.lines).toHaveLength(0);
    const t = structuredClone(s);
    t.weekLog.lines.push({ id: s.player.athleteId, t: s.career.teamId, o: Object.keys(s.teams).find((k) => k !== s.career.teamId)!, ts: 60, os: 50, min: 20, pts: 22, reb: 5, ast: 3, stl: 1, blk: 0, fgm: 9, fga: 15, tpm: 2, tpa: 5, tov: 1, gs: 20 });
    const seed = t.rngState;
    publishIssue(t, 'weekly');
    expect(t.rngState).toBe(seed);
    expect(t.weekLog.lines).toHaveLength(0);
    expect(t.paper.length).toBe(s.paper.length + 1);
  });

  it('notices when a new leader takes over', () => {
    const s = midSeason(13, 'hs', 5);
    const last = s.paper.filter((i) => i.kind === 'weekly').pop()!;
    // pretend last week's scoring leader was somebody else
    const t = structuredClone(s);
    const prev = structuredClone(last);
    const scoring = prev.leaders.find((l) => l.label === 'Scoring')!;
    const imposter = Object.keys(t.athletes).find((k) => k !== scoring.rows[0].id)!;
    scoring.rows[0] = { ...scoring.rows[0], id: imposter, name: 'Someone Else' };
    prev.id = 999;
    t.paper = [prev];
    const issue = publishIssue(t, 'weekly');
    const notes = issue.sections.find((x) => x.id === 'leaders')?.items.map((i) => i.text) ?? [];
    expect(notes.some((n) => /takes over the scoring lead/.test(n) && n.includes('Someone Else'))).toBe(true);
  });

  it('has a playoff edition with the round named, and keeps only recent issues', () => {
    const s = make(14);
    const rng = new RNG(14);
    playUntil(s, rng, (x) => x.career.phase === 'playoffs' && !x.career.lifeEvent);
    // play one playoff week if the team made it
    const before = s.paper.length;
    playUntil(s, rng, (x) => x.paper.length > before || x.career.phase === 'offseason');
    const po = s.paper.find((i) => i.kind === 'playoffs');
    if (po) {
      expect(po.dateline).toMatch(/Final|Semifinals|Quarterfinals|Round|Championship/);
      expect(po.sections.find((x) => x.id === 'standings')?.title).toBe('The Bracket');
    }
    const n = 0;
    void n;
    // a whole career never keeps more than 40
    const c = make(15);
    const r2 = new RNG(15);
    let ticks = 0;
    while (c.career.phase !== 'retired' && ticks++ < 30000) tick(c, r2);
    expect(c.paper.length).toBeLessThanOrEqual(40);
    expect(c.paper.length).toBeGreaterThan(20);
    expect(() => GameStateSchema.parse(JSON.parse(JSON.stringify(c)))).not.toThrow();
  }, 60_000);

  it('the first week of a new level is reported in the right league', () => {
    const s = make(16);
    const rng = new RNG(16);
    playUntil(s, rng, (x) => x.career.level === 'college' && x.career.phase === 'regular' && x.career.week >= 2 && !x.career.lifeEvent);
    const latest = s.paper[s.paper.length - 1];
    expect(latest.masthead).toContain('National Collegiate Conference');
    expect(latest.dateline).toContain('College');
  });
});
