import { motion, useReducedMotion } from 'framer-motion';
import { LEVEL_CONFIG, yearLabel } from '../../data/teams';
import { careerTimeline } from '../../engine/analytics';
import { fmt1 } from '../../engine/stats';
import { useStore } from '../../state/store';
import { cx } from './ui';

/** Horizontal strip of every season: stats, titles, awards, defining moments, and who left. */
export function CareerTimeline() {
  const game = useStore((s) => s.game)!;
  const reduce = useReducedMotion();
  const seasons = careerTimeline(game);
  return (
    <div className="overflow-x-auto pb-2 scrollbar-thin">
      <ol className="flex min-w-max gap-3">
        {seasons.map((s, i) => (
          <motion.li
            key={s.season}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.06 }}
            className={cx('relative w-56 shrink-0 rounded-xl border p-3', s.isCurrent ? 'border-hoop-500/70 bg-hoop-500/10' : 'border-court-700 bg-court-850/80')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm font-semibold text-hoop-400">Season {s.season}</span>
              {s.isCurrent && <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">now</span>}
            </div>
            <div className="text-xs text-ink-400">
              {LEVEL_CONFIG[s.level].label} · {yearLabel(s.level, s.year)}
            </div>
            {s.gp > 0 ? (
              <div className="mt-2 font-mono text-xs text-ink-300">
                {fmt1(s.ppg)} pts · {fmt1(s.rpg)} reb · {fmt1(s.apg)} ast
              </div>
            ) : (
              <div className="mt-2 text-xs text-ink-500">No games yet</div>
            )}
            <ul className="mt-2 space-y-1 text-xs">
              {s.champion && <li className="text-gold">🏆 League champions</li>}
              {s.awards.map((a) => (
                <li key={a} className="text-gold">
                  🏅 {a}
                </li>
              ))}
              {s.moments.map((m) => (
                <li key={m} className="text-ink-300">
                  ★ {m}
                </li>
              ))}
              {s.departures.map((n) => (
                <li key={n} className="text-ink-500">
                  👋 {n} moved on
                </li>
              ))}
            </ul>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
