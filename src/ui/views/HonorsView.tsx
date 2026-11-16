import { useState } from 'react';
import { KIND_ORDER, honorRoll, kindLabel, mostDecorated } from '../../engine/honors';
import type { Honor, HonorKind, Level } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Panel, cx } from '../components/ui';

const LEVELS: { id: Level | 'all'; label: string }[] = [
  { id: 'all', label: 'All leagues' },
  { id: 'hs', label: 'High school' },
  { id: 'college', label: 'College' },
  { id: 'pro', label: 'Pro' },
];
const LEVEL_NAME: Record<Level, string> = { hs: 'High school', college: 'College', pro: 'Pro' };
const ICON: Record<HonorKind, string> = { champion: '🏆', mvp: '⭐', dpoy: '🛡️', first: '🥇', second: '🥈', allstar: '✨' };

const chip = (on: boolean) => cx('min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors', on ? 'border-hoop-500 bg-hoop-500/15 text-hoop-400' : 'border-court-700 text-ink-300 hover:border-court-500');

function Line({ h }: { h: Honor }) {
  return (
    <li className={cx('flex items-baseline gap-2 py-1 text-sm', h.user && 'rounded bg-hoop-500/10 px-1.5')}>
      <span className="min-w-0 flex-1 truncate text-ink-100">
        {h.name}
        {h.user && <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-hoop-400">You</span>}
        {h.athleteId && h.team && <span className="ml-2 text-xs text-ink-500">{h.team}</span>}
      </span>
      {h.stat && <span className="shrink-0 font-mono text-xs text-ink-400">{h.stat}</span>}
    </li>
  );
}

/** Every season's champions, MVPs, All-League teams and All-Stars, in every league you have played in. */
export function HonorsView() {
  const game = useStore((s) => s.game)!;
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [shown, setShown] = useState(3);
  const roll = honorRoll(game, level);
  const decorated = mostDecorated(game);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="League">
        {LEVELS.map((l) => (
          <button key={l.id} role="tab" aria-selected={level === l.id} className={chip(level === l.id)} onClick={() => setLevel(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {roll.length === 0 && (
            <Panel title="Honor roll">
              <p className="text-sm text-ink-500">Nothing yet. The All-Stars are named at the midpoint of the season, and the champion, MVP and All-League teams when it ends.</p>
            </Panel>
          )}
          {roll.slice(0, shown).map((b) => (
            <Panel key={`${b.season}-${b.level}`} title={`Season ${b.season} · ${LEVEL_NAME[b.level]}`} right={b.season === game.career.season ? <span className="text-xs text-hoop-400">This season</span> : undefined}>
              <div className="space-y-4">
                {KIND_ORDER.filter((k) => b.byKind[k]?.length).map((k) => (
                  <section key={k} aria-label={kindLabel(k, b.level)}>
                    <h4 className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                      <span aria-hidden>{ICON[k]}</span> {kindLabel(k, b.level)}
                    </h4>
                    <ul className={cx('mt-1 divide-y divide-court-800', k === 'allstar' || k === 'first' || k === 'second' ? 'md:columns-2 md:gap-x-8 md:divide-y-0' : '')}>
                      {b.byKind[k]!.map((h) => (
                        <Line key={`${h.athleteId}-${h.name}`} h={h} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </Panel>
          ))}
          {roll.length > shown && (
            <button onClick={() => setShown(shown + 5)} className="text-sm font-semibold text-hoop-400 hover:text-hoop-500">
              Show earlier seasons ({roll.length - shown} more)
            </button>
          )}
        </div>

        <aside className="space-y-4">
          <Panel title="Most decorated">
            {decorated.length === 0 ? (
              <p className="text-sm text-ink-500">No honors handed out yet.</p>
            ) : (
              <ol className="divide-y divide-court-800">
                {decorated.map((d, i) => (
                  <li key={d.athleteId} className={cx('flex items-center gap-3 py-2', d.user && 'rounded bg-hoop-500/10 px-1.5')}>
                    <span className={cx('w-5 text-center font-mono text-sm', i === 0 ? 'text-gold' : 'text-ink-500')}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink-100">
                        {d.name}
                        {d.user && <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-hoop-400">You</span>}
                      </div>
                      <div className="text-xs text-ink-500">
                        {d.mvps} MVP · {d.teams} All-League · {d.allStars} All-Star
                      </div>
                    </div>
                    <span className="font-mono text-lg text-hoop-400">{d.total}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-ink-500">Counts every honor on record, in every league, from the first season you can see.</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
