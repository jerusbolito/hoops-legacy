import { useEffect, useState } from 'react';
import { doneGoals, openGoals } from '../../engine/goals';
import { planHeir } from '../../engine/legacy';
import { TIER_LABELS, TIER_MIN } from '../../engine/legacyScore';
import { overall } from '../../engine/ratings';
import { deleteLegend, listLegends } from '../../state/persistence';
import type { GameState, Legend } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Button, Meter, Panel, Pill, cx } from '../components/ui';

export const TIER_COLORS = ['#94a3b8', '#7dd3fc', '#4ade80', '#fbbf24', '#fb923c', '#f472b6'];

const bank = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

export function TierChip({ tier, label }: { tier: number; label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: TIER_COLORS[tier], borderColor: `${TIER_COLORS[tier]}66` }}>
      {label ?? TIER_LABELS[tier]}
    </span>
  );
}

/** The long-term goals on the hub: always something in sight. */
export function GoalsCard() {
  const game = useStore((s) => s.game)!;
  const open = openGoals(game);
  const done = doneGoals(game);
  if (!open.length && !done.length) return null;
  return (
    <Panel title="Goals" right={game.legacy.generation > 1 ? <Pill>Generation {game.legacy.generation}</Pill> : undefined}>
      <ul className="space-y-3">
        {open.map((g) => (
          <li key={g.id}>
            <div className="flex items-start gap-2 text-sm">
              <span aria-hidden>{g.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-snug text-ink-100">{g.title}</div>
                <div className="text-xs text-ink-400">{g.detail}</div>
              </div>
              <span className="font-mono text-xs text-ink-400">{g.pct}%</span>
            </div>
            <Meter className="mt-1.5" value={g.pct} showValue={false} color={g.pct >= 75 ? 'var(--color-gold)' : 'var(--color-hoop-500)'} />
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <div className="mt-4 border-t border-court-700 pt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Reached ({done.length})</div>
          <ul className="space-y-1 text-xs text-ink-400">
            {done.map((g) => (
              <li key={g.id}>
                <span className="mr-1 text-win">✓</span>
                {g.title} <span className="text-ink-500">· season {g.doneSeason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** One career in the Hall of Fame or on the family tree. */
export function LegendCard({ l, rank, onRemove, open: startOpen = false }: { l: Legend; rank?: number; onRemove?: () => void; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <li className="rounded-lg border border-court-700 bg-court-900/50">
      <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {rank !== undefined && <span className="w-6 text-center font-mono text-xs text-ink-500">{rank}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{l.name}</span>
            <TierChip tier={l.tier} label={l.tierLabel} />
            {l.generation > 1 && <span className="text-[10px] uppercase tracking-widest text-ink-500">Gen {l.generation}</span>}
          </div>
          <div className="truncate text-xs text-ink-400">
            {l.titles} title{l.titles === 1 ? '' : 's'} · {l.mvps} MVP{l.mvps === 1 ? '' : 's'} · {l.allStars} All-Star · {l.seasons} seasons{l.proGp ? ` · ${l.proPpg.toFixed(1)} ppg as a pro` : ''}
          </div>
        </div>
        <span className="font-mono text-lg" style={{ color: TIER_COLORS[l.tier] }}>
          {Math.round(l.score)}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-court-700 px-3 py-3 text-sm">
          <p className="text-ink-300">{l.summary}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-500">Peak rating</dt>
              <dd className="font-mono">{l.peakOverall}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Career</dt>
              <dd className="font-mono">
                {l.ppg.toFixed(1)} / {l.rpg.toFixed(1)} / {l.apg.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Draft</dt>
              <dd className="font-mono">{l.draftPick ? `#${l.draftPick}` : 'Undrafted'}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Fortune</dt>
              <dd className="font-mono">{bank(l.earnings)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Goals</dt>
              <dd className="font-mono">
                {l.goalsDone} of {l.goalsTotal}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Family</dt>
              <dd>{l.married ? 'Married' : 'Single'}{l.kids ? ` · ${l.kids} kid${l.kids === 1 ? '' : 's'}` : ''}</dd>
            </div>
            <div>
              <dt className="text-ink-500">From</dt>
              <dd>{l.hometown || '—'}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Last team</dt>
              <dd>{l.teams[0] ?? '—'}</dd>
            </div>
          </dl>
          {l.parent && <p className="text-xs text-ink-500">Carried on the legacy of {l.parent}.</p>}
          {onRemove && (
            <button className="text-xs text-ink-500 underline hover:text-loss" onClick={onRemove}>
              Remove from the Hall of Fame
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Who came before, oldest first. Hidden when this is the first generation. */
export function FamilyTree({ game }: { game: GameState }) {
  const line = game.legacy.lineage;
  if (!line.length) return null;
  return (
    <Panel title={`The ${game.legacy.family || line[0].lastName} family`}>
      <ul className="space-y-2">
        {line.map((l) => (
          <LegendCard key={l.id} l={l} />
        ))}
      </ul>
    </Panel>
  );
}

/** The Hall of Fame across every career ever finished on this device. */
export function HallOfFame() {
  const [rows, setRows] = useState<Legend[] | null>(null);
  const refresh = () => listLegends().then(setRows).catch(() => setRows([]));
  useEffect(() => {
    void refresh();
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <Panel title="Hall of Fame" right={<span className="text-xs text-ink-500">{rows.length} career{rows.length === 1 ? '' : 's'}</span>} className="mt-6">
      <ul className="space-y-2">
        {rows.map((l, i) => (
          <LegendCard
            key={l.id}
            l={l}
            rank={i + 1}
            onRemove={async () => {
              if (confirm(`Remove ${l.name} from the Hall of Fame? Their save is not affected.`)) {
                await deleteLegend(l.id);
                await refresh();
              }
            }}
          />
        ))}
      </ul>
    </Panel>
  );
}

/** How far the next tier is. */
export function TierProgress({ score, tier }: { score: number; tier: number }) {
  const next = TIER_MIN[tier + 1];
  if (next === undefined) return <p className="text-xs text-ink-400">The highest tier there is.</p>;
  return (
    <div>
      <Meter value={score - TIER_MIN[tier]} max={next - TIER_MIN[tier]} showValue={false} color={TIER_COLORS[tier + 1]} />
      <p className="mt-1 text-xs text-ink-400">
        {Math.max(1, Math.ceil(next - score))} more points to {TIER_LABELS[tier + 1]}.
      </p>
    </div>
  );
}

/** At retirement: who plays next, and a button to carry the save on. */
export function HeirCard() {
  const game = useStore((s) => s.game)!;
  const go = useStore((s) => s.continueLegacy);
  const [busy, setBusy] = useState(false);
  const plan = planHeir(game);
  const a = plan.athlete;
  return (
    <Panel title="The next generation" className="border-hoop-500/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold">
            {a.firstName} {a.lastName}
          </div>
          <p className="mt-1 text-sm text-ink-300">{plan.blurb}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
            <div>
              Starts at <span className="font-mono text-ink-100">{overall(a.ratings)}</span> overall
            </div>
            <div>
              Potential <span className="font-mono text-ink-100">{a.potential}</span>
            </div>
            <div>
              Born into <TierChip tier={plan.tier} />
            </div>
            {plan.money > 0 && (
              <div>
                Family money <span className="font-mono text-ink-100">{bank(plan.money)}</span>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-ink-500">
            The same save carries on: a new high school league, a new cast, a clean record. {plan.parentName}&apos;s career goes into the family record, and the heir&apos;s first goal is to go further.
          </p>
        </div>
        <Button
          className={cx('px-6 py-3 text-base')}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await go();
            } finally {
              setBusy(false);
            }
          }}
        >
          Continue the legacy
        </Button>
      </div>
    </Panel>
  );
}
