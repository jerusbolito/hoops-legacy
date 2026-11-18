import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { LEVEL_CONFIG } from '../../data/teams';
import { draftStock, marketValue, projectedPick, recruitingStars, userAthlete } from '../../engine/career';
import { boardRank, draftBoard } from '../../engine/draft';
import { overall } from '../../engine/ratings';
import { averages, fmt1, seasonRows, totals } from '../../engine/stats';
import { marketPreview } from '../../engine/transactions';
import { legendOf } from '../../engine/legacyScore';
import { listLegends, saveLegend } from '../../state/persistence';
import { CoachCard } from './CoachingPanel';
import { useStore } from '../../state/store';
import { FamilyTree, HeirCard, TierChip, TierProgress } from '../components/Legacy';
import { PlayerLink } from '../components/PlayerLink';
import { Typewriter } from '../components/Typewriter';
import { Button, Panel, Spinner, Stat, TeamBadge } from '../components/ui';

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);

export function RecruitingPanel() {
  const game = useStore((s) => s.game)!;
  const offers = useStore((s) => s.offers.college);
  const load = useStore((s) => s.loadRecruiting);
  const commit = useStore((s) => s.commit);
  const busy = useStore((s) => s.busy);
  useEffect(() => load(), [load]);
  const stars = recruitingStars(game);

  return (
    <Panel title="Recruiting — choose your college">
      <div className="mb-5 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Recruit rating</div>
          <div className="text-2xl text-gold">{'★'.repeat(stars)}<span className="text-court-600">{'★'.repeat(5 - stars)}</span></div>
        </div>
        <Stat label="Overall" value={overall(userAthlete(game).ratings)} />
        <Stat label="GPA" value={game.player.academics.toFixed(2)} />
      </div>
      {!offers ? (
        <Spinner label="Coaches are calling…" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {offers.map((o, i) => (
            <motion.div key={o.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="rounded-xl border border-court-600 bg-court-800/50 p-4">
              <div className="flex items-center gap-3">
                <TeamBadge team={{ abbrev: o.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(), colors: o.colors }} size={44} />
                <div>
                  <div className="font-display text-lg font-semibold">{o.name}</div>
                  <div className="text-xs text-ink-400">
                    {o.mascot} · Prestige {o.prestige}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-300">{o.pitch}</p>
              <p className="mt-1 text-xs text-ink-400">Playing time: {o.playingTime}</p>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => commit(o.name)}>
                Commit to {o.name}
              </Button>
            </motion.div>
          ))}
        </div>
      )}
      {busy && <div className="mt-4"><Spinner label="Hats on the table…" /></div>}
    </Panel>
  );
}

export function DraftPanel() {
  const game = useStore((s) => s.game)!;
  const enter = useStore((s) => s.enterDraft);
  const busy = useStore((s) => s.busy);
  return (
    <Panel title="Draft night">
      <p className="text-ink-300">The green room. Your family is here. Your phone will not stop buzzing.</p>
      <div className="my-5 flex gap-8">
        <Stat label="Projection" value={projectedPick(game).replace('Projected ', '')} />
        <Stat label="Stock" value={draftStock(game).toFixed(1)} />
        <Stat label="Overall" value={overall(userAthlete(game).ratings)} />
      </div>
      <div className="mb-5">
        <div className="mb-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">The big board · you are #{boardRank(game)}</div>
        <ol className="divide-y divide-court-800 text-sm">
          {draftBoard(game).slice(0, 12).map((p, i) => (
            <li key={p.id} className={`flex items-center justify-between gap-3 py-1.5 ${p.isUser ? 'font-semibold text-hoop-400' : ''}`}>
              <span>
                <span className="mr-2 font-mono text-ink-500">{i + 1}</span>
                <PlayerLink id={p.id}>{p.name}</PlayerLink> {p.isUser && <span className="text-[10px] uppercase">you</span>}
                {p.isRival && <span className="ml-1 text-[10px] text-loss uppercase">rival</span>}
                {p.isFriend && <span className="ml-1 text-[10px] text-win uppercase">friend</span>}
                <span className="ml-2 text-xs text-ink-500">{p.position} · {p.team}</span>
              </span>
              <span className="font-mono text-xs text-ink-300">OVR {p.ovr} · stock {p.stock}</span>
            </li>
          ))}
        </ol>
      </div>
      <Button onClick={enter} disabled={busy} className="px-8 py-3 text-base">
        {busy ? 'The commissioner approaches the podium…' : 'Start the draft'}
      </Button>
    </Panel>
  );
}

export function FreeAgencyPanel() {
  const game = useStore((s) => s.game)!;
  const offers = useStore((s) => s.offers.fa);
  const load = useStore((s) => s.loadFreeAgency);
  const sign = useStore((s) => s.sign);
  useEffect(() => load(), [load]);
  return (
    <Panel title="Free agency">
      <p className="mb-4 text-ink-300">
        Your market value: <span className="font-mono text-gold">{money(marketValue(game))}/yr</span>. Your agent has offers.
      </p>
      {!offers ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <div key={o.teamName} className="rounded-xl border border-court-600 bg-court-800/50 p-4">
              <div className="font-display text-lg font-semibold">
                {o.teamName} {o.mascot} {o.current && <span className="text-xs text-hoop-400">(current team)</span>}
              </div>
              <div className="mt-2 font-mono text-2xl text-win">{money(o.salary)}<span className="text-sm text-ink-400">/yr × {o.years}</span></div>
              <div className="text-xs text-ink-400">Total {money(o.salary * o.years)} · Prestige {o.prestige}</div>
              <div className="text-xs text-ink-500">Cap room {money(o.capSpace)}{o.capSpace < marketValue(game) * 0.9 ? ' (tight: they cannot pay your full price)' : ''}</div>
              <Button className="mt-3 w-full" onClick={() => sign(o)}>
                Sign
              </Button>
            </div>
          ))}
        </div>
      )}
      {offers && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Also on the market</div>
          <ul className="divide-y divide-court-800 text-sm">
            {marketPreview(game).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {p.name} <span className="text-xs text-ink-500">{p.position} · age {p.age} · {p.team}</span>
                </span>
                <span className="font-mono text-xs text-ink-300">OVR {p.ovr} · asks {money(p.asking)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500">Teams will sign these players around you once you decide. Your choice shapes who is left for them.</p>
        </div>
      )}
    </Panel>
  );
}

export function RetiredPanel() {
  const game = useStore((s) => s.game)!;
  const close = useStore((s) => s.closeCareer);
  const a = userAthlete(game);
  const rows = seasonRows(game.gameLog);
  const career = averages(totals(game.gameLog));
  const pro = averages(totals(game.gameLog.filter((g) => g.level === 'pro')));
  const champs = game.player.awards.filter((x) => x.name.endsWith('Champion'));
  const mvps = game.player.awards.filter((x) => x.name.includes('MVP'));
  // the career goes into the Hall of Fame (filing it twice only ever writes one row), and we see where it ranks
  const legend = useMemo(() => legendOf(game), [game]);
  const [place, setPlace] = useState<{ pos: number; total: number } | null>(null);
  useEffect(() => {
    let live = true;
    saveLegend(legend)
      .then(() => listLegends())
      .then((all) => live && setPlace({ pos: all.findIndex((l) => l.id === legend.id) + 1, total: all.length }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [legend]);
  return (
    <div className="space-y-4">
      <Panel>
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">A career remembered</div>
          <h2 className="mt-2 font-display text-4xl font-bold">
            {a.firstName} {a.lastName}
          </h2>
          <p className="text-ink-400">
            {rows.length} seasons · {game.player.hometown}
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Pro PPG" value={fmt1(pro.ppg)} />
          <Stat label="Pro games" value={pro.gp} />
          <Stat label="Titles" value={champs.length} />
          <Stat label="MVPs" value={mvps.length} />
          <Stat label="Earnings" value={money(game.player.money)} />
        </div>
        <p className="mt-4 text-sm text-ink-400">All-level career: {career.gp} games, {fmt1(career.ppg)} ppg.</p>
      </Panel>
      <Panel title="Hall of Fame verdict">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <TierChip tier={legend.tier} label={legend.tierLabel} />
            <div className="mt-1 font-display text-4xl font-bold">{Math.round(legend.score)}</div>
            <div className="text-xs text-ink-400">career points{place && place.pos > 0 ? ` · #${place.pos} of ${place.total} in your Hall of Fame` : ''}</div>
          </div>
          <div className="min-w-[200px] flex-1">
            <TierProgress score={legend.score} tier={legend.tier} />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-300">{legend.summary}</p>
        {legend.tier >= 3 && game.player.origin.chosen && <p className="mt-2 text-sm text-gold">Number {game.player.origin.look.number} is retired to the rafters.</p>}
      </Panel>
      <HeirCard />
      <CoachCard />
      <FamilyTree game={game} />
      <Panel title="Trophy case">
        {game.player.awards.length === 0 ? (
          <p className="text-sm text-ink-500">No hardware, but you made it.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {game.player.awards.map((x, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                🏆 <span>{x.name}</span>
                <span className="text-xs text-ink-500">
                  {LEVEL_CONFIG[x.level].label} · S{x.season}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {game.story.seasonSummaries.length > 0 && (
        <Panel title="The story">
          <Typewriter text={game.story.seasonSummaries.map((s) => s.text).join('\n')} className="text-sm leading-relaxed text-ink-300" />
        </Panel>
      )}
      <Button onClick={close}>Back to title</Button>
    </div>
  );
}
