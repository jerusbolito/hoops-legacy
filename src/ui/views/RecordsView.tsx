import { useState } from 'react';
import { MIN_GP, formatValue, recordList, statsFor, type RecordLevel, type Scope } from '../../engine/records';
import { useStore } from '../../state/store';
import { Panel, cx } from '../components/ui';

const LEVEL_TABS: { id: RecordLevel; label: string }[] = [
  { id: 'all', label: 'All leagues' },
  { id: 'hs', label: 'High school' },
  { id: 'college', label: 'College' },
  { id: 'pro', label: 'Pro' },
];
const LEVEL_NAME = { hs: 'HS', college: 'College', pro: 'Pro' } as const;

const chip = (on: boolean) => cx('min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors', on ? 'border-hoop-500 bg-hoop-500/15 text-hoop-400' : 'border-court-700 text-ink-300 hover:border-court-500');

/** Top ten of everything, for one game or a season, in one league or all of them. */
export function RecordsView() {
  const game = useStore((s) => s.game)!;
  const [scope, setScope] = useState<Scope>('game');
  const [level, setLevel] = useState<RecordLevel>(game.career.level);
  const [stat, setStat] = useState('pts');
  const stats = statsFor(scope);
  const def = stats.find((s) => s.key === stat) ?? stats[0];
  const rows = recordList(game, scope, level, def.key);
  const mine = rows.filter((r) => r.user).length;

  return (
    <div className="space-y-4">
      <Panel
        title="Record books"
        right={mine > 0 ? <span className="text-xs text-hoop-400">{mine} of the top {rows.length} {mine === 1 ? 'is' : 'are'} yours</span> : undefined}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Record type">
            {(['game', 'season'] as Scope[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={scope === s}
                className={chip(scope === s)}
                onClick={() => {
                  setScope(s);
                  if (s === 'game' && statsFor('game').every((x) => x.key !== stat)) setStat('pts');
                }}
              >
                {s === 'game' ? 'Single game' : 'Single season'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="League">
            {LEVEL_TABS.map((l) => (
              <button key={l.id} role="tab" aria-selected={level === l.id} className={chip(level === l.id)} onClick={() => setLevel(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stat">
            {stats.map((s) => (
              <button key={s.key} role="tab" aria-selected={def.key === s.key} className={chip(def.key === s.key)} onClick={() => setStat(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={`Most ${def.label.toLowerCase()} · ${scope === 'game' ? 'one game' : 'one season'} · ${LEVEL_TABS.find((l) => l.id === level)!.label.toLowerCase()}`}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing on the books yet. {scope === 'season' ? 'Season records are filed when a season ends.' : 'Play a few games and the first marks will go up.'}</p>
        ) : (
          <ol className="divide-y divide-court-800">
            {rows.map((r, i) => (
              <li key={`${r.athleteId}-${r.season}-${r.level}-${i}`} className={cx('flex items-center gap-3 py-2.5', r.user && 'rounded-lg bg-hoop-500/10 px-2')}>
                <span className={cx('w-6 text-center font-mono text-sm', i === 0 ? 'text-gold' : 'text-ink-500')}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-100">
                    {r.name}
                    {r.user && <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-hoop-400">You</span>}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {r.team}
                    {r.opp && ` vs ${r.opp}`} · S{r.season} {LEVEL_NAME[r.level]}
                    {scope === 'season' && r.gp > 0 && ` · ${r.gp} games`}
                  </div>
                </div>
                <span className="font-mono text-xl font-semibold text-hoop-400">{formatValue(def.key, r.value)}</span>
              </li>
            ))}
          </ol>
        )}
        {scope === 'season' && def.key.endsWith('pg') && <p className="mt-3 text-xs text-ink-500">Averages count from {MIN_GP} games played.</p>}
      </Panel>
    </div>
  );
}
