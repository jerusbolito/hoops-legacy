import { useMemo, useState } from 'react';
import { advancedLine, bestGames, consistency, formSeries, playerRows, splits, teamAnalytics, userPercentiles, type PlayerRow } from '../../engine/analytics';
import { fmt1, fmtPct, gameScore, lineSummary } from '../../engine/stats';
import { useStore } from '../../state/store';
import { FormChart, PercentileBar } from '../components/charts';
import { Panel, Stat, TeamBadge, cx } from '../components/ui';

type Sub = 'me' | 'league' | 'teams';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'me', label: 'My game' },
  { id: 'league', label: 'All players' },
  { id: 'teams', label: 'Teams' },
];

export function AnalyticsView() {
  const [sub, setSub] = useState<Sub>('me');
  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-court-700 bg-court-900 p-1 sm:w-fit" role="tablist">
        {SUBS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sub === s.id}
            onClick={() => setSub(s.id)}
            className={cx('flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors sm:flex-none', sub === s.id ? 'bg-court-700 text-ink-100' : 'text-ink-400 hover:text-ink-100')}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'me' && <MyGame />}
      {sub === 'league' && <AllPlayers />}
      {sub === 'teams' && <Teams />}
    </div>
  );
}

/* ───────────────────────── My game ───────────────────────── */

function MyGame() {
  const game = useStore((s) => s.game)!;
  const seasons = useMemo(() => [...new Set(game.gameLog.map((e) => e.season))].sort((a, b) => a - b), [game.gameLog]);
  const [scope, setScope] = useState<'career' | number>('career');
  const entries = scope === 'career' ? game.gameLog : game.gameLog.filter((e) => e.season === scope);
  const adv = advancedLine(entries);
  const series = formSeries(entries);
  const cons = consistency(series);
  const best = bestGames(entries);
  const sp = splits(entries);
  const rows = playerRows(game);
  const pcts = userPercentiles(rows);
  const oppName = (id: string) => game.teams[id]?.name ?? '?';

  if (!game.gameLog.some((e) => e.line.sec > 0)) {
    return <Panel title="My game">Play a game and your advanced numbers will show up here.</Panel>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-5">
        <Panel
          title="Advanced stats"
          right={
            <select
              value={String(scope)}
              onChange={(e) => setScope(e.target.value === 'career' ? 'career' : Number(e.target.value))}
              className="rounded-md border border-court-600 bg-court-900 px-2 py-1 text-xs text-ink-100"
              aria-label="Season"
            >
              <option value="career">Career</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  Season {s}
                </option>
              ))}
            </select>
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat label="True shooting" value={fmtPct(adv.ts)} sub="pts per scoring try" />
            <Stat label="Effective FG" value={fmtPct(adv.efg)} sub="3s count extra" />
            <Stat label="Pts / shot" value={adv.ptsPerShot.toFixed(2)} sub="FGA + 0.44 FTA" />
            <Stat label="Ast / TO" value={adv.astTov.toFixed(2)} sub="ball security" />
            <Stat label="3-pt rate" value={fmtPct(adv.threeRate)} sub="shots from deep" />
            <Stat label="FT rate" value={adv.ftRate.toFixed(2)} sub="FTA per FGA" />
            <Stat label="Game score" value={fmt1(adv.gmsc)} sub="avg per game" />
            <Stat label="Consistency" value={cons.label} sub={cons.stdev ? `±${cons.stdev.toFixed(1)} game score` : undefined} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-court-700 pt-4 sm:grid-cols-4">
            <Stat label="Pts / 36" value={fmt1(adv.per36.pts)} />
            <Stat label="Reb / 36" value={fmt1(adv.per36.reb)} />
            <Stat label="Ast / 36" value={fmt1(adv.per36.ast)} />
            <Stat label="Stl+Blk / 36" value={fmt1(adv.per36.stocks)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
            <span>
              <b className="font-mono text-ink-100">{adv.twentyPlus}</b> games of 20+ points
            </span>
            <span>
              <b className="font-mono text-ink-100">{adv.doubleDoubles}</b> double-doubles
            </span>
            <span>
              <b className="font-mono text-ink-100">{adv.tripleDoubles}</b> triple-doubles
            </span>
          </div>
        </Panel>

        <Panel title="Form" right={<span className="text-xs text-ink-500">game score · line = 5-game average</span>}>
          <FormChart series={series} opponentName={oppName} />
          <p className="mt-2 text-xs text-ink-500">Filled bars are wins, outlined bars are losses. Hover a bar for the game.</p>
        </Panel>

        <Panel title="Splits">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500">
                <tr className="border-b border-court-700 text-right">
                  <th className="py-1.5 text-left">Situation</th>
                  <th>GP</th>
                  <th>PPG</th>
                  <th>RPG</th>
                  <th>APG</th>
                  <th>TS%</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {sp.map((s) => (
                  <tr key={s.label} className="border-b border-court-800 text-right">
                    <td className="py-1.5 text-left font-sans">{s.label}</td>
                    <td>{s.gp}</td>
                    <td className="text-ink-100">{fmt1(s.ppg)}</td>
                    <td>{fmt1(s.rpg)}</td>
                    <td>{fmt1(s.apg)}</td>
                    <td>{fmtPct(s.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Where you rank" right={<span className="text-xs text-ink-500">this season, league-wide</span>}>
          {pcts.length ? (
            <div className="space-y-2.5">
              {pcts.map((p) => (
                <PercentileBar key={p.key} label={p.label} value={p.value} pct={p.pct} />
              ))}
              <p className="pt-1 text-xs text-ink-500">Percentile among {rows.length} players who have played this season. 50th is average.</p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">Needs a few more games of league data.</p>
          )}
        </Panel>
        <Panel title="Best games">
          <ul className="space-y-3 text-sm">
            {best.map((g) => (
              <li key={g.gameId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className={g.teamScore > g.oppScore ? 'text-win' : 'text-loss'}>{g.teamScore > g.oppScore ? 'W' : 'L'}</span> vs {oppName(g.oppId)}
                    {g.playoff && <span className="ml-1 text-gold">★</span>}
                  </span>
                  <span className="font-mono text-xs text-hoop-400">GmSc {gameScore(g.line).toFixed(1)}</span>
                </div>
                <div className="font-mono text-xs text-ink-400">{lineSummary(g.line)}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* ───────────────────────── All players ───────────────────────── */

type SortKey = 'ovr' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'mpg' | 'impact36' | 'overPerform' | 'age' | 'potential';

const COLS: { key: SortKey; label: string; digits: number; hint: string }[] = [
  { key: 'ovr', label: 'OVR', digits: 0, hint: 'Overall rating' },
  { key: 'potential', label: 'POT', digits: 0, hint: 'Potential' },
  { key: 'age', label: 'AGE', digits: 0, hint: 'Age' },
  { key: 'mpg', label: 'MPG', digits: 1, hint: 'Minutes per game' },
  { key: 'ppg', label: 'PPG', digits: 1, hint: 'Points per game' },
  { key: 'rpg', label: 'RPG', digits: 1, hint: 'Rebounds per game' },
  { key: 'apg', label: 'APG', digits: 1, hint: 'Assists per game' },
  { key: 'spg', label: 'SPG', digits: 1, hint: 'Steals per game' },
  { key: 'bpg', label: 'BPG', digits: 1, hint: 'Blocks per game' },
  { key: 'impact36', label: 'IMP/36', digits: 1, hint: 'Points + rebounds + assists + steals + blocks per 36 minutes' },
  { key: 'overPerform', label: 'vs OVR', digits: 1, hint: 'Production above (+) or below (−) what the rating usually produces. Finds breakout players and underachievers.' },
];

function AllPlayers() {
  const game = useStore((s) => s.game)!;
  const [sort, setSort] = useState<SortKey>('impact36');
  const [desc, setDesc] = useState(true);
  const [pos, setPos] = useState('all');
  const [scope, setScope] = useState<'league' | 'team'>('league');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const all = useMemo(() => playerRows(game, 2), [game]);

  const rows = all
    .filter((r) => (pos === 'all' || r.position === pos) && (scope === 'league' || r.teamId === game.career.teamId) && r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));

  const setSortKey = (k: SortKey) => {
    if (k === sort) setDesc(!desc);
    else {
      setSort(k);
      setDesc(k !== 'age');
    }
  };

  if (!all.length) return <Panel title="All players">Not enough games played yet.</Panel>;

  return (
    <Panel
      title={`Player explorer · ${all.length} players`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search players" className="w-28 rounded-md border border-court-600 bg-court-900 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-500" />
          <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position" className="rounded-md border border-court-600 bg-court-900 px-2 py-1 text-xs text-ink-100">
            {['all', 'PG', 'SG', 'SF', 'PF', 'C'].map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'All positions' : p}
              </option>
            ))}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'league' | 'team')} aria-label="Scope" className="rounded-md border border-court-600 bg-court-900 px-2 py-1 text-xs text-ink-100">
            <option value="league">Whole league</option>
            <option value="team">My team</option>
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500">
            <tr className="border-b border-court-700 text-right">
              <th className="py-2 text-left">Player</th>
              <th className="text-left">Team</th>
              <th>POS</th>
              {COLS.map((c) => (
                <th key={c.key} title={c.hint} aria-sort={sort === c.key ? (desc ? 'descending' : 'ascending') : 'none'}>
                  <button onClick={() => setSortKey(c.key)} className={cx('px-1.5 py-1 font-semibold uppercase tracking-wider hover:text-ink-100', sort === c.key && 'text-hoop-400')}>
                    {c.label}
                    {sort === c.key && (desc ? ' ↓' : ' ↑')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.slice(0, limit).map((r) => (
              <Row key={r.id} r={r} teamAbbrev={r.teamId ? game.teams[r.teamId]?.abbrev : '—'} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + 25)} className="mt-3 text-xs font-semibold text-hoop-400 hover:text-hoop-500">
          Show more ({rows.length - limit} left)
        </button>
      )}
      <p className="mt-3 text-xs text-ink-500">Minimum 2 games. Hover a column header for what it means. Click a header to sort.</p>
    </Panel>
  );
}

function Row({ r, teamAbbrev }: { r: PlayerRow; teamAbbrev?: string }) {
  return (
    <tr className={cx('border-b border-court-800 text-right', r.isUser && 'bg-hoop-500/10 text-hoop-400')}>
      <td className="py-1.5 text-left font-sans">{r.name}</td>
      <td className="text-left font-sans text-xs text-ink-400">{teamAbbrev}</td>
      <td className="text-ink-400">{r.position}</td>
      {COLS.map((c) => (
        <td key={c.key} className={cx(c.key === 'overPerform' && (r[c.key] > 1 ? 'text-win' : r[c.key] < -1 ? 'text-loss' : ''))}>
          {c.key === 'overPerform' && r[c.key] > 0 ? '+' : ''}
          {r[c.key].toFixed(c.digits)}
        </td>
      ))}
    </tr>
  );
}

/* ───────────────────────── Teams ───────────────────────── */

function Teams() {
  const game = useStore((s) => s.game)!;
  const rows = teamAnalytics(game);
  if (!rows.length) return <Panel title="Teams">No games played yet.</Panel>;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.margin)));
  return (
    <Panel title="Team efficiency" right={<span className="text-xs text-ink-500">sorted by scoring margin</span>}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500">
            <tr className="border-b border-court-700 text-right">
              <th className="py-2 text-left">#</th>
              <th className="text-left">Team</th>
              <th>W-L</th>
              <th>PPG</th>
              <th>OPP</th>
              <th className="w-48 text-left">Margin</th>
              <th title="Win % expected from points scored and allowed">Exp W%</th>
              <th title="Actual wins minus expected wins. Positive = winning more than the scoring suggests.">Luck</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => {
              const t = game.teams[r.teamId];
              const mine = r.teamId === game.career.teamId;
              return (
                <tr key={r.teamId} className={cx('border-b border-court-800 text-right', mine && 'text-hoop-400')}>
                  <td className="py-1.5 text-left text-ink-500">{r.rank}</td>
                  <td className="text-left font-sans">
                    <span className="flex items-center gap-2">
                      <TeamBadge team={t} size={22} /> {t.name}
                    </span>
                  </td>
                  <td>
                    {r.w}-{r.l}
                  </td>
                  <td>{fmt1(r.ppg)}</td>
                  <td>{fmt1(r.oppg)}</td>
                  <td className="text-left">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 w-28 rounded-full bg-court-700">
                        <div className="absolute top-0 left-1/2 h-full w-px bg-court-500" />
                        <div
                          className="absolute top-0 h-full rounded-full"
                          style={{ background: r.margin >= 0 ? 'var(--color-win)' : 'var(--color-loss)', left: r.margin >= 0 ? '50%' : `${50 - (Math.abs(r.margin) / maxAbs) * 50}%`, width: `${(Math.abs(r.margin) / maxAbs) * 50}%` }}
                        />
                      </div>
                      <span className={cx('w-10', r.margin >= 0 ? 'text-win' : 'text-loss')}>
                        {r.margin > 0 ? '+' : ''}
                        {fmt1(r.margin)}
                      </span>
                    </div>
                  </td>
                  <td>{(r.pythag * 100).toFixed(0)}%</td>
                  <td className={r.luck > 0.75 ? 'text-win' : r.luck < -0.75 ? 'text-loss' : 'text-ink-400'}>
                    {r.luck > 0 ? '+' : ''}
                    {r.luck.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-500">
        Teams that outscore opponents by a lot but have a middling record are due to win more. Teams with high Luck are winning close games and may cool off.
      </p>
    </Panel>
  );
}
