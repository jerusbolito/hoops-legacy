import { careerHighs, type Best } from '../../engine/records';
import { useStore } from '../../state/store';
import { cx } from './ui';

function Row({ b }: { b: Best }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink-100">{b.label}</div>
        <div className="truncate text-xs text-ink-500">{b.detail}</div>
      </div>
      {b.rank !== null && (
        <span className={cx('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest', b.rank === 1 ? 'border-gold/60 text-gold' : 'border-court-600 text-ink-400')} title="Place in the league record book">
          {b.rank === 1 ? 'Record' : `#${b.rank} ever`}
        </span>
      )}
      <span className="w-12 text-right font-mono text-lg font-semibold text-hoop-400">{b.value}</span>
    </li>
  );
}

/** Your best night and best season in every category, with a badge where it made the record book. */
export function CareerHighs() {
  const game = useStore((s) => s.game)!;
  const { games, seasons } = careerHighs(game);
  if (!games.length) return <p className="text-sm text-ink-500">Play a game and your best nights will be kept here.</p>;
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">In a game</div>
        <ul className="divide-y divide-court-800">
          {games.map((b) => (
            <Row key={b.label} b={b} />
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">In a season</div>
        {seasons.length ? (
          <ul className="divide-y divide-court-800">
            {seasons.map((b) => (
              <Row key={b.label} b={b} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-ink-500">Season bests appear once you have played {8} games in a season.</p>
        )}
      </div>
    </div>
  );
}
