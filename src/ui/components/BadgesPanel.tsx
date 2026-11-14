import { badgeStatus } from '../../engine/badges';
import { useStore } from '../../state/store';
import { cx } from './ui';

/** Badges you have earned and how close you are to the rest. Locked ones show exactly what is missing. */
export function BadgesPanel() {
  const game = useStore((s) => s.game)!;
  const all = badgeStatus(game).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);
  const earned = all.filter((b) => b.unlocked).length;
  return (
    <div>
      <p className="mb-3 text-xs text-ink-400">
        {earned} of {all.length} earned. Badges come from your ratings plus what you have actually done on the court. Some add a signature move to key moments.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {all.map(({ def, reqs, progress, unlocked, ready }) => (
          <li key={def.id} className={cx('rounded-lg border p-3', unlocked ? 'border-gold/50 bg-gold/5' : 'border-court-700 bg-court-850/60')}>
            <div className="flex items-center gap-2">
              <span className={cx('text-xl', !unlocked && 'opacity-50 grayscale')}>{def.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{def.name}</div>
                <div className="text-xs text-ink-400">{def.blurb}</div>
              </div>
              {unlocked ? <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-gold uppercase">Earned</span> : ready ? <span className="text-[10px] font-semibold text-win uppercase">Ready</span> : <span className="font-mono text-xs text-ink-500">{Math.round(progress * 100)}%</span>}
            </div>
            <p className="mt-2 text-xs text-ink-300">{def.effect}</p>
            {!unlocked && (
              <ul className="mt-2 space-y-1.5">
                {reqs.map((r) => {
                  const done = r.have >= r.need;
                  return (
                    <li key={r.label} className="text-[11px]">
                      <div className="flex justify-between text-ink-400">
                        <span>{r.label}</span>
                        <span className={cx('font-mono', done ? 'text-win' : 'text-ink-300')}>
                          {Math.min(r.have, 9999)}/{r.need} {done && '✓'}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-court-700">
                        <div className={cx('h-full rounded-full', done ? 'bg-win' : 'bg-hoop-500')} style={{ width: `${Math.min(100, (r.have / r.need) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
