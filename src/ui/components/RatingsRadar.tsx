import { motion, useReducedMotion } from 'framer-motion';
import { RATING_KEYS, RATING_LABELS, type RatingKey, type Ratings } from '../../state/schemas';

export function RatingsRadar({ ratings, size = 240, compare, deltas }: { ratings: Ratings; size?: number; compare?: Ratings; deltas?: Partial<Record<RatingKey, number>> }) {
  const reduce = useReducedMotion();
  const c = size / 2;
  const r = size / 2 - 40;
  const n = RATING_KEYS.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / 99), c + Math.sin(a) * r * (v / 99)];
  };
  const poly = (rs: Ratings) => RATING_KEYS.map((k, i) => pt(i, rs[k]).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
      {[25, 50, 75, 99].map((lvl) => (
        <polygon key={lvl} points={RATING_KEYS.map((_, i) => pt(i, lvl).join(',')).join(' ')} fill="none" stroke="var(--color-court-600)" strokeWidth={lvl === 99 ? 1.2 : 0.6} />
      ))}
      {RATING_KEYS.map((_, i) => {
        const [x, y] = pt(i, 99);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--color-court-700)" strokeWidth={0.6} />;
      })}
      {compare && <polygon points={poly(compare)} fill="rgba(148,163,184,0.12)" stroke="rgba(148,163,184,0.6)" strokeDasharray="3 3" strokeWidth={1} />}
      <motion.polygon
        initial={false}
        animate={{ points: poly(ratings) }}
        transition={{ type: 'spring', stiffness: 80, damping: 16 }}
        fill="rgba(249,115,22,0.22)"
        stroke="var(--color-hoop-500)"
        strokeWidth={2}
      />
      {RATING_KEYS.map((k, i) => {
        const d = deltas?.[k];
        if (!d) return null;
        const [vx, vy] = pt(i, ratings[k]);
        const col = d > 0 ? '#22c55e' : '#ef4444';
        return (
          <g key={`pulse${k}`}>
            <circle cx={vx} cy={vy} r={3.5} fill={col} />
            {!reduce && <motion.circle cx={vx} cy={vy} fill="none" stroke={col} strokeWidth={1.6} initial={{ r: 4, opacity: 0.9 }} animate={{ r: [4, 17], opacity: [0.9, 0] }} transition={{ duration: 1.3, repeat: 3, ease: 'easeOut' }} />}
          </g>
        );
      })}
      {RATING_KEYS.map((k, i) => {
        const [x, y] = pt(i, 118);
        const d = deltas?.[k];
        return (
          <g key={k}>
            <text x={x} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-400)" fontWeight={600} letterSpacing={1}>
              {RATING_LABELS[k]}
            </text>
            <text x={x} y={y + 9} textAnchor="middle" fontSize={11} fill={d ? (d > 0 ? '#22c55e' : '#ef4444') : 'var(--color-ink-100)'} fontFamily="JetBrains Mono" fontWeight={d ? 700 : 400}>
              {ratings[k]}
              {d ? ` ${d > 0 ? '+' : ''}${d}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
