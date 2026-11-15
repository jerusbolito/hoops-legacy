import { useState } from 'react';
import { STAT_BY_KEY, STAT_DEFS, gamesSoFar, leaders, type StatKey } from '../../engine/leaders';
import { useStore } from '../../state/store';
import { PlayerLink } from './PlayerLink';
import { Panel, cx } from './ui';

/** Every category, top ten, with a name that opens the player's card. */
export function LeadersPanel() {
  const game = useStore((s) => s.game)!;
  const [key, setKey] = useState<StatKey>('ppg');
  const rows = leaders(game, key, 10);
  const def = STAT_BY_KEY[key];
  const so = gamesSoFar(game);
  return (
    <Panel title="League leaders" className="lg:col-span-2" right={<span className="text-xs text-ink-500">{so ? `After ${so} game${so === 1 ? '' : 's'}` : 'Season not started'}</span>}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Statistic">
        {STAT_DEFS.map((d) => (
          <button key={d.key} role="tab" aria-selected={d.key === key} onClick={() => setKey(d.key)} className={cx('rounded-md border px-2 py-1 text-xs font-semibold transition-colors', d.key === key ? 'border-hoop-500 bg-hoop-500/15 text-hoop-400' : 'border-court-700 text-ink-400 hover:border-court-500 hover:text-ink-100')}>
            {d.short}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nobody qualifies yet. Check back after a few games.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-wider text-ink-500 uppercase">
            <tr className="border-b border-court-700 text-left">
              <th className="w-8 py-1.5 font-semibold">#</th>
              <th className="font-semibold">{def.label}</th>
              <th className="font-semibold">Team</th>
              <th className="text-right font-semibold">GP</th>
              <th className="text-right font-semibold">{def.short}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx('border-b border-court-800', r.isYou && 'bg-hoop-500/10 text-hoop-400')}>
                <td className="py-1.5 font-mono text-xs text-ink-500">{r.rank}</td>
                <td>
                  <PlayerLink id={r.id}>{r.name}</PlayerLink>
                  {r.isYou && <span className="ml-1.5 text-[10px] uppercase">you</span>}
                  {r.isRival && <span className="ml-1.5 text-[10px] text-loss uppercase">rival</span>}
                  {r.isFriend && <span className="ml-1.5 text-[10px] text-win uppercase">friend</span>}
                </td>
                <td className="text-xs text-ink-400">{r.team}</td>
                <td className="text-right font-mono text-xs text-ink-400">{r.gp}</td>
                <td className="text-right font-mono font-semibold">{r.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {def.pct && <p className="mt-2 text-xs text-ink-500">Only players with enough shots to count are listed.</p>}
    </Panel>
  );
}
