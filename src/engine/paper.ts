import type { GameState, Issue, PaperItem, ScheduledGame, WeekLine } from '../state/schemas';
import { allStarIds, mvpRace, scoredPlayers } from './awards';
import { coachOf, coachStanding } from './coach';
import { STAT_DEFS, leaders, perGame, type StatKey } from './leaders';
import { playoffRoundName, sortedStandings } from './league';
import { overall } from './ratings';
import { RNG } from './rng';
import { rivalryGame, seriesText } from './rivalry';
import { LEVEL_CONFIG, yearLabel } from '../data/teams';

/**
 * The weekly paper: what happened to you, to your people and to everyone else. Built only from the week's real box
 * scores, the standings and the league's own news, so every line in it is true. Uses its own random generator so
 * printing a paper never changes how the game plays out.
 */

const MAX_ISSUES = 40;
const HOT_POINTS = { hs: 25, college: 28, pro: 34 } as const;
const LEAD_STATS: StatKey[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg'];

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

type Ctx = ReturnType<typeof context>;

function context(state: GameState) {
  const c = state.career;
  const me = state.athletes[state.player.athleteId];
  const myTeam = state.teams[c.teamId];
  const seed = (Math.imul(c.season, 2654435761) ^ Math.imul(c.week + 1, 40503) ^ 0x9a9e) >>> 0;
  const rng = new RNG(seed);
  const name = (id: string) => {
    const a = state.athletes[id];
    return a ? `${a.firstName} ${a.lastName}` : 'Someone';
  };
  const team = (id: string) => state.teams[id]?.name ?? 'a team';
  const item = (text: string, ...ids: string[]): PaperItem => ({ text, people: [...new Set(ids)].filter((i) => state.athletes[i]).map((id) => ({ id, name: name(id) })) });
  const hot = HOT_POINTS[c.level];
  return { state, c, me, myTeam, rng, name, team, item, hot };
}

const dd = (l: Pick<WeekLine, 'pts' | 'reb' | 'ast' | 'stl' | 'blk'>) => [l.pts, l.reb, l.ast, l.stl, l.blk].filter((v) => v >= 10).length;

function tagOf(x: Ctx, l: WeekLine, pointsTag = true): string {
  const n = dd(l);
  if (n >= 3) return 'a triple-double';
  if (n >= 2) return 'a double-double';
  if (pointsTag && l.pts >= x.hot) return `a ${l.pts}-point night`;
  if (l.stl >= 5) return `${l.stl} steals`;
  if (l.blk >= 5) return `${l.blk} blocks`;
  return '';
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const lineText = (l: WeekLine) => `${plural(l.pts, 'point')}, ${plural(l.reb, 'rebound')} and ${plural(l.ast, 'assist')} on ${l.fgm}-of-${l.fga} shooting`;
/** "a win over X" / "a loss to X" */
const resultText = (won: boolean, opp: string) => (won ? `a win over ${opp}` : `a loss to ${opp}`);

function weekGames(state: GameState): ScheduledGame[] {
  return state.league.schedule.filter((g) => g.week === state.career.week && g.played);
}

function standingsRows(state: GameState, prev: Issue | undefined) {
  const order = sortedStandings(state.league);
  const before = prev ? prev.standings.map((s) => s.team) : [];
  const rows = order.map((id, i) => {
    const t = state.teams[id];
    const st = state.league.standings[id];
    const was = before.indexOf(t.name);
    return { team: t.name, w: st.w, l: st.l, you: id === state.career.teamId, move: was < 0 ? 0 : was - i };
  });
  return { top: rows.slice(0, 6), mine: rows.find((r) => r.you)!, rank: order.indexOf(state.career.teamId) + 1, all: rows };
}

function leaderBoards(state: GameState) {
  return LEAD_STATS.map((k) => {
    const def = STAT_DEFS.find((d) => d.key === k)!;
    return { label: def.label, key: k, rows: leaders(state, k, 3).map((r) => ({ id: r.id, name: r.name, team: r.team, value: r.display })) };
  }).filter((b) => b.rows.length);
}

/** Who passed whom since the last paper. */
function leaderChanges(x: Ctx, boards: ReturnType<typeof leaderBoards>, prev: Issue | undefined): PaperItem[] {
  if (!prev) return [];
  const out: PaperItem[] = [];
  for (const b of boards) {
    const was = prev.leaders.find((p) => p.label === b.label)?.rows[0];
    const now = b.rows[0];
    if (was && now && was.id !== now.id) {
      const noun = { Scoring: 'scoring', Rebounding: 'rebounding', Assists: 'assist', Steals: 'steals', Blocks: 'blocks' }[b.label] ?? b.label.toLowerCase();
      out.push(x.item(`${now.name} (${now.team}) takes over the ${noun} lead at ${now.value}, passing ${was.name}.`, now.id, was.id));
    }
  }
  return out;
}

/* ───────────────────────── The weekly edition ───────────────────────── */

const COACH_WIN = ['We played the way we talk about playing.', 'That group believes in each other.', 'We made the winning plays when it counted.', 'Proud of the effort. We have more to give.'];
const COACH_LOSS = ['We did not do the little things.', 'Credit to them. We have to be better.', 'It stings, and it should.', 'We will watch the film and fix it.'];

function weekly(state: GameState, prev: Issue | undefined): Issue {
  const x = context(state);
  const { c, me, myTeam, rng } = x;
  const playoff = c.phase === 'playoffs';
  const games = weekGames(state);
  const lines = state.weekLog.lines;
  const mine = games.find((g) => g.homeId === c.teamId || g.awayId === c.teamId);
  const myLine = lines.find((l) => l.id === me.id);
  const round = mine?.playoffRound ? playoffRoundName(state.league, mine.playoffRound) : '';
  const board = [...lines].sort((a, b) => b.gs - a.gs);
  const star = board[0];
  const st = standingsRows(state, prev);
  const boards = leaderBoards(state);
  const story = Object.values(state.npcs).filter((n) => n.active && n.athleteId && state.athletes[n.athleteId] && ['rival', 'friend', 'teammate'].includes(n.role));

  // ── your game ──
  let headline = '';
  let deck = '';
  const lead: PaperItem[] = [];
  if (mine) {
    const home = mine.homeId === c.teamId;
    const ours = home ? mine.homeScore! : mine.awayScore!;
    const theirs = home ? mine.awayScore! : mine.homeScore!;
    const opp = x.team(home ? mine.awayId : mine.homeId);
    const won = ours > theirs;
    const margin = Math.abs(ours - theirs);
    const score = `${Math.max(ours, theirs)}-${Math.min(ours, theirs)}`;
    const record = `${st.mine.w}-${st.mine.l}`;
    if (!myLine) {
      headline = `${myTeam.name} ${won ? 'Win' : 'Fall'} Without ${me.lastName}`;
      deck = `${myTeam.name} ${won ? 'beat' : 'lost to'} ${opp}, ${score}, with ${me.lastName} on the sideline. They are ${record}.`;
    } else if (won && myLine.pts >= x.hot) {
      headline = `${me.lastName} Pours In ${myLine.pts} As ${myTeam.name} Beat ${opp}`;
      deck = `${myTeam.name} ${margin >= 12 ? 'cruise' : 'hold on'}, ${score}, behind ${me.firstName} ${me.lastName}'s ${myLine.pts} points. ${record} on the year.`;
    } else if (won) {
      headline = margin >= 15 ? `${myTeam.name} Rout ${opp}, ${score}` : margin <= 4 ? `${myTeam.name} Edge ${opp} in a Tight One` : `${myTeam.name} Top ${opp}, ${score}`;
      deck = `${me.lastName} adds ${myLine.pts} points, ${myLine.reb} rebounds and ${myLine.ast} assists. ${myTeam.name} are ${record}.`;
    } else {
      headline = margin >= 15 ? `${opp} Run Past ${myTeam.name}, ${score}` : `${opp} Hold Off ${myTeam.name}, ${score}`;
      deck = `${me.lastName} finishes with ${myLine.pts} points in the loss. ${myTeam.name} fall to ${record}.`;
    }
    if (playoff) {
      headline = won ? `${round}: ${headline}` : `Season Ends in the ${round}: ${opp} ${score}`;
      deck = won ? `${myTeam.name} move on. ${deck}` : `${myTeam.name}'s run is over. ${deck}`;
    }
    const coach = coachOf(state);
    const quotes = won ? COACH_WIN : COACH_LOSS;
    const quote = (myLine && myLine.gs >= 20 && won ? `${me.lastName} gave us everything tonight.` : rng.pick(quotes)).replace(/\.$/, '');
    lead.push(
      x.item(
        `${myTeam.name} ${won ? 'beat' : 'fell to'} ${opp}, ${score}, ${home ? 'at home' : 'on the road'}${playoff ? ` in the ${round.toLowerCase()}` : ''}. ${myLine ? `${me.firstName} ${me.lastName} finished with ${lineText(myLine)}${tagOf(x, myLine) ? `, ${tagOf(x, myLine)}` : ''}.` : `${me.lastName} did not play.`}${coach ? ` "${quote}," said coach ${coach.name}.` : ''}`,
        me.id,
      ),
    );
  } else if (star) {
    const a = state.athletes[star.id];
    headline = `${a.lastName} Lights Up ${x.team(star.o)} for ${star.pts}`;
    deck = `A quiet week for ${myTeam.name}, but the league had plenty to talk about.`;
  } else {
    headline = `${state.league.name} Takes a Breather`;
    deck = 'No games this week. The league rests and regroups.';
  }

  // ── your people ──
  const mineLines: PaperItem[] = [];
  for (const n of story) {
    const l = lines.find((q) => q.id === n.athleteId);
    if (!l) continue;
    const a = state.athletes[n.athleteId!];
    const label = n.role === 'rival' ? 'Your rival' : n.role === 'friend' ? 'Your best friend' : 'Your teammate';
    const won = l.ts > l.os;
    mineLines.push(x.item(`${label} ${a.firstName} ${a.lastName} (${x.team(l.t)}) had ${lineText(l)} in ${resultText(won, x.team(l.o))}${tagOf(x, l) ? `: ${tagOf(x, l)}` : ''}.`, a.id));
  }
  if (mineLines.length) lead.push(x.item(`In your world: ${mineLines.length} of the people who matter to you took the floor this week.`));

  // ── the league's best ──
  const performers: PaperItem[] = [];
  const seen = new Set<string>();
  for (const l of board) {
    if (seen.has(l.id) || performers.length >= 4) continue;
    seen.add(l.id);
    const t = tagOf(x, l, false);
    performers.push(x.item(`${x.name(l.id)} (${x.team(l.t)}): ${l.pts} pts, ${l.reb} reb, ${l.ast} ast, ${l.fgm}-${l.fga} FG in ${resultText(l.ts > l.os, x.team(l.o))}${t ? ` (${t})` : ''}.`, l.id));
  }
  if (star && (!mine || star.id !== me.id)) lead.push(x.item(`Around the league, ${x.name(star.id)} of ${x.team(star.t)} had the night of the week: ${lineText(star)} against ${x.team(star.o)}.`, star.id));

  // ── the standings ──
  const standNotes: PaperItem[] = [];
  const first = st.all[0];
  if (first) standNotes.push(x.item(`${first.team} lead the ${state.league.name} at ${first.w}-${first.l}${first.you ? ', and that is you' : ''}.`));
  const climbers = st.all.filter((r) => r.move >= 2).slice(0, 2);
  for (const r of climbers) standNotes.push(x.item(`${r.team} climb ${r.move} spots to ${ord(st.all.indexOf(r) + 1)}.`));
  const sliders = st.all.filter((r) => r.move <= -2).slice(0, 2);
  for (const r of sliders) standNotes.push(x.item(`${r.team} slide ${-r.move} spots to ${ord(st.all.indexOf(r) + 1)}.`));
  if (!playoff) {
    const line = state.league.playoffTeams;
    standNotes.push(x.item(st.rank <= line ? `${myTeam.name} sit ${ord(st.rank)}, inside the playoff line.` : `${myTeam.name} sit ${ord(st.rank)}, ${st.rank - line} spot${st.rank - line === 1 ? '' : 's'} outside the playoff line.`));
  }

  // ── leaders and the race ──
  const leaderNotes = leaderChanges(x, boards, prev);
  const race = mvpRace(state, 3);
  const raceItems = race.length >= 2 ? race.map((r, i) => x.item(`${i + 1}. ${r.name} (${r.team}): ${r.ppg.toFixed(1)} ppg${r.isYou ? ', and that is you' : r.isRival ? ', your rival' : ''}.`, r.id)) : [];

  // ── around the league ──
  const moved = state.transactions.filter((t) => t.season === c.season && t.week === c.week && t.kind !== 'recruit');
  const wire = state.news
    .filter((n) => n.season === c.season && n.week === c.week && !n.text.includes(me.lastName) && !/MVP race|finishes the season/.test(n.text) && !moved.some((m) => m.text === n.text))
    .map((n) => n.text);
  const around = [...moved.map((m) => m.text), ...wire].slice(0, 6).map((t) => x.item(t));

  // ── the recruiting trail ──
  const trail: PaperItem[] = state.transactions.filter((t) => t.season === c.season && t.week === c.week && t.kind === 'recruit').slice(0, 3).map((t) => x.item(t.text));
  for (const t of state.recruiting.targets) {
    const l = lines.find((q) => q.id === t.athleteId);
    if (l) trail.push(x.item(`Your recruiting target ${t.name} had ${l.pts} points for ${x.team(l.t)}. ${t.pull >= 50 ? 'You are in good shape with them.' : 'You still have work to do.'}`, t.athleteId));
  }

  // ── next week ──
  const next: PaperItem[] = [];
  const nextGame = state.league.schedule.find((g) => g.week === c.week + 1 && !g.played && (g.homeId === c.teamId || g.awayId === c.teamId));
  if (nextGame) {
    const oppId = nextGame.homeId === c.teamId ? nextGame.awayId : nextGame.homeId;
    const os = state.league.standings[oppId];
    const rv = rivalryGame(state, oppId);
    next.push(x.item(`${nextGame.homeId === c.teamId ? 'Home' : 'Road'} game against ${x.team(oppId)} (${os.w}-${os.l}).${rv ? ` It is a rivalry game: ${rv.rival.name}'s team, and ${seriesText(rv.w, rv.l)}.` : ''}`, rv?.rival.athleteId ?? ''));
  } else if (!playoff && c.week >= state.league.regularWeeks) next.push(x.item('The regular season is over. The playoffs are next.'));
  if (state.player.injury) next.push(x.item(`${me.lastName} is out with a ${state.player.injury.desc}, ${state.player.injury.weeks} more week${state.player.injury.weeks === 1 ? '' : 's'}.`, me.id));
  const cs = coachStanding(state);
  if (cs.hasCoach) next.push(x.item(`${me.lastName}'s role: ${cs.label.toLowerCase()}, about ${cs.minutes} minutes a game.`, me.id));

  const sections = [
    { id: 'performers', title: 'Players of the Week', items: performers },
    { id: 'story', title: 'Your World', items: mineLines },
    { id: 'standings', title: playoff ? 'The Bracket' : 'Standings Watch', items: standNotes },
    { id: 'leaders', title: 'League Leaders', items: leaderNotes },
    { id: 'race', title: 'MVP Race', items: raceItems },
    { id: 'around', title: 'Around the League', items: around },
    { id: 'recruiting', title: 'The Recruiting Trail', items: trail },
    { id: 'next', title: 'Next Up', items: next },
  ].filter((s) => s.items.length);

  return {
    id: 0,
    kind: playoff ? 'playoffs' : 'weekly',
    season: c.season,
    week: c.week,
    masthead: `The ${state.league.name} Report`,
    dateline: `${playoff ? round || 'Playoffs' : `Week ${c.week}`} · Season ${c.season} · ${LEVEL_CONFIG[c.level].label}`,
    headline,
    deck,
    lead,
    sections,
    scoreboard: games.map((g) => ({ away: x.team(g.awayId), home: x.team(g.homeId), as: g.awayScore ?? 0, hs: g.homeScore ?? 0, you: g.homeId === c.teamId || g.awayId === c.teamId, round: g.playoffRound ? playoffRoundName(state.league, g.playoffRound) : undefined })),
    standings: st.top.concat(st.top.some((r) => r.you) ? [] : [st.mine]),
    leaders: boards.map((b) => ({ label: b.label, rows: b.rows })),
  };
}

/* ───────────────────────── The season preview ───────────────────────── */

function strength(state: GameState, teamId: string): number {
  const top = state.teams[teamId].rosterIds.map((id) => state.athletes[id]).filter(Boolean).map((a) => overall(a.ratings)).sort((a, b) => b - a).slice(0, 8);
  return top.reduce((s, v) => s + v, 0) / Math.max(1, top.length);
}

function preview(state: GameState): Issue {
  const x = context(state);
  const { c, me, myTeam } = x;
  const ranked = [...state.league.teamIds].sort((a, b) => strength(state, b) - strength(state, a));
  const myRank = ranked.indexOf(c.teamId) + 1;
  const watch = state.league.teamIds
    .flatMap((t) => state.teams[t].rosterIds)
    .map((id) => state.athletes[id])
    .filter(Boolean)
    .sort((a, b) => overall(b.ratings) - overall(a.ratings))
    .slice(0, 5);
  const power = ranked.slice(0, 5).map((id, i) => x.item(`${i + 1}. ${state.teams[id].name} (team rating ${Math.round(strength(state, id))}${id === c.teamId ? ', that is you' : ''}).`));
  const cs = coachStanding(state);
  const yours: PaperItem[] = [
    x.item(`${myTeam.name} are picked ${ord(myRank)} of ${ranked.length} in the ${state.league.name}.${myRank <= 3 ? ' Expectations are high.' : myRank >= ranked.length - 2 ? ' Few expect much, which can be freeing.' : ''}`),
    x.item(`${me.firstName} ${me.lastName} (${overall(me.ratings)}) enters as ${cs.label.toLowerCase()}${cs.hasCoach ? `, with coach ${cs.coachName} trusting you ${Math.round(cs.trust)} out of 100` : ''}.`, me.id),
  ];
  const stories = Object.values(state.npcs).filter((n) => n.active && n.athleteId && state.athletes[n.athleteId] && (n.role === 'rival' || n.role === 'friend'));
  const people = stories.map((n) => {
    const a = state.athletes[n.athleteId!];
    return x.item(`${n.role === 'rival' ? 'Your rival' : 'Your best friend'} ${a.firstName} ${a.lastName} is ${overall(a.ratings)} overall at ${a.teamId ? x.team(a.teamId) : 'no team'}${n.lastSeason ? `, coming off ${n.lastSeason.ppg} ppg` : ''}.`, a.id);
  });
  const newcomers = state.transactions.filter((t) => t.season === c.season - 1 || t.season === c.season).slice(-4).map((t) => x.item(t.text));
  const sections = [
    { id: 'power', title: 'Power Rankings', items: power },
    { id: 'watch', title: 'Players to Watch', items: watch.map((a) => x.item(`${a.firstName} ${a.lastName}, ${a.position}, ${x.team(a.teamId!)} (${overall(a.ratings)}).`, a.id)) },
    { id: 'yours', title: 'Your Team', items: yours },
    { id: 'story', title: 'Your World', items: people },
    { id: 'around', title: 'Offseason Moves', items: newcomers },
  ].filter((s) => s.items.length);
  return {
    id: 0,
    kind: 'preview',
    season: c.season,
    week: 0,
    masthead: `The ${state.league.name} Report`,
    dateline: `Season ${c.season} Preview · ${LEVEL_CONFIG[c.level].label} · ${yearLabel(c.level, c.year)}`,
    headline: `${state.teams[ranked[0]].name} Open as Favorites${ranked[0] === c.teamId ? ', and That Means You' : ''}`,
    deck: `Season ${c.season} tips off. ${myTeam.name} are picked ${ord(myRank)}.`,
    lead: [x.item(`${state.teams[ranked[0]].name} come in with the league's strongest roster, but a season is long. ${watch[0] ? `${watch[0].firstName} ${watch[0].lastName} (${overall(watch[0].ratings)}) is the player everyone is watching.` : ''}`, watch[0]?.id ?? '')],
    sections,
    scoreboard: [],
    standings: [],
    leaders: [],
  };
}

/* ───────────────────────── The season in review ───────────────────────── */

function recap(state: GameState): Issue {
  const x = context(state);
  const { c, me, myTeam } = x;
  const champ = state.league.champion ? state.teams[state.league.champion] : null;
  const scored = scoredPlayers(state);
  const mvp = scored[0];
  const dpoy = [...scored].sort((a, b) => b.def - a.def)[0];
  const st = standingsRows(state, undefined);
  const boards = leaderBoards(state);
  const mine = state.gameLog.filter((e) => e.season === c.season);
  const n = mine.length || 1;
  const ppg = mine.reduce((s, e) => s + e.line.pts, 0) / n;
  const rpg = mine.reduce((s, e) => s + e.line.orb + e.line.drb, 0) / n;
  const apg = mine.reduce((s, e) => s + e.line.ast, 0) / n;
  const you = champ?.id === c.teamId;
  const awards = state.player.awards.filter((a) => a.season === c.season).map((a) => a.name);
  const stars = allStarIds(state);
  const lead: PaperItem[] = [
    x.item(champ ? `${champ.name} win the ${state.league.name} title${you ? ', and you were part of it' : ''}.` : `The ${state.league.name} season is in the books.`),
    x.item(`${me.firstName} ${me.lastName} averaged ${ppg.toFixed(1)} points, ${rpg.toFixed(1)} rebounds and ${apg.toFixed(1)} assists in ${mine.length} games for ${myTeam.name}, who finished ${ord(st.rank)} at ${st.mine.w}-${st.mine.l}.${awards.length ? ` Honors: ${awards.join(', ')}.` : ''}`, me.id),
  ];
  const people = Object.values(state.npcs)
    .filter((q) => q.active && q.athleteId && state.athletes[q.athleteId] && (q.role === 'rival' || q.role === 'friend') && state.leagueStats[q.athleteId])
    .map((q) => {
      const a = state.athletes[q.athleteId!];
      const p = perGame(state.leagueStats[a.id]);
      return x.item(`${q.role === 'rival' ? 'Your rival' : 'Your best friend'} ${a.firstName} ${a.lastName}: ${p.ppg.toFixed(1)} ppg, ${p.rpg.toFixed(1)} rpg, ${p.apg.toFixed(1)} apg for ${x.team(a.teamId!)}.`, a.id);
    });
  const awardsItems: PaperItem[] = [];
  if (mvp) awardsItems.push(x.item(`Most Valuable Player: ${x.name(mvp.id)} (${x.team(state.athletes[mvp.id].teamId!)}).`, mvp.id));
  if (dpoy) awardsItems.push(x.item(`Defensive Player of the Year: ${x.name(dpoy.id)}.`, dpoy.id));
  awardsItems.push(...scored.slice(0, 5).map((s, i) => x.item(`All-${state.career.level === 'pro' ? 'League' : 'Conference'} First Team #${i + 1}: ${x.name(s.id)}.`, s.id)));
  const moves = state.transactions.filter((t) => t.season === c.season);
  const yearMoves = [
    [moves.filter((m) => m.kind === 'transfer').length, 'transfer'],
    [moves.filter((m) => m.kind === 'trade').length, 'trade'],
    [moves.filter((m) => m.kind === 'signing').length, 'signing'],
    [moves.filter((m) => m.kind === 'coach').length, 'coaching change'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, noun]) => plural(n as number, noun as string));
  const sections = [
    { id: 'awards', title: 'The Awards', items: awardsItems },
    { id: 'story', title: 'Your World', items: people },
    { id: 'around', title: 'The Year in Moves', items: yearMoves.length ? [x.item(`${yearMoves.join(', ')} around the league this season.`)] : [] },
    { id: 'stars', title: 'All-Stars', items: stars.length ? [x.item(`${stars.length} players made the midseason All-Star team${state.player.awards.some((a) => a.name === 'All-Star' && a.season === c.season) ? `, including you` : ''}.`)] : [] },
  ].filter((s) => s.items.length);
  return {
    id: 0,
    kind: 'recap',
    season: c.season,
    week: c.week,
    masthead: `The ${state.league.name} Report`,
    dateline: `Season ${c.season} in Review · ${LEVEL_CONFIG[c.level].label}`,
    headline: champ ? (you ? `${champ.name} Are Champions!` : `${champ.name} Cut Down the Nets`) : 'The Season Ends',
    deck: `${myTeam.name} finish ${ord(st.rank)}. ${mvp ? `${x.name(mvp.id)} is named MVP.` : ''}`,
    lead,
    sections,
    scoreboard: [],
    standings: st.top.concat(st.top.some((r) => r.you) ? [] : [st.mine]),
    leaders: boards.map((b) => ({ label: b.label, rows: b.rows })),
  };
}

/** Print an issue: the engine tells the week, files it, and clears the week's box-score lines. */
export function publishIssue(state: GameState, kind: Issue['kind']): Issue {
  const prev = [...state.paper].reverse().find((i) => i.kind === 'weekly' || i.kind === 'playoffs');
  const issue = kind === 'preview' ? preview(state) : kind === 'recap' ? recap(state) : weekly(state, prev);
  issue.id = (state.paper[state.paper.length - 1]?.id ?? 0) + 1;
  state.paper.push(issue);
  if (state.paper.length > MAX_ISSUES) state.paper.splice(0, state.paper.length - MAX_ISSUES);
  state.weekLog.lines = [];
  return issue;
}
