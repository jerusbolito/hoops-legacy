import { motion, useReducedMotion } from 'framer-motion';
import type { PlayEvent } from '../../engine/gameSim';

const W = 300;
const H = 230;
const BX = W / 2;
const BY = 26;
const SCALE = 300;

const toXY = (s: NonNullable<PlayEvent['shot']>) => ({ x: (s.x - 0.5) * SCALE + BX, y: BY + s.y * SCALE * 0.68 });

/** Half-court SVG with a live shot chart and an animated flight for the most recent shot. Basket at the top. */
export function Court({ events, color, animate = true }: { events: PlayEvent[]; color: string; animate?: boolean }) {
  const reduce = useReducedMotion();
  const shots = events.filter((e) => e.shot).slice(-60);
  const last = shots[shots.length - 1];
  const lastKey = events.lastIndexOf(last);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: 'linear-gradient(180deg,#3b2a1a,#2b1f14)' }}>
      <g stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} fill="none">
        <rect x={4} y={4} width={W - 8} height={H - 8} />
        <rect x={BX - 36} y={4} width={72} height={110} fill={`${color}33`} />
        <circle cx={BX} cy={114} r={36} />
        <path d={`M 22 4 L 22 70 A 140 140 0 0 0 ${W - 22} 70 L ${W - 22} 4`} />
        <circle cx={BX} cy={BY} r={6} stroke="#f97316" strokeWidth={2} />
        <line x1={BX - 18} y1={BY - 8} x2={BX + 18} y2={BY - 8} strokeWidth={2.5} stroke="rgba(255,255,255,0.7)" />
        <path d={`M ${BX - 60} ${H - 4} A 60 60 0 0 1 ${BX + 60} ${H - 4}`} />
      </g>
      {shots.map((e, i) => {
        const s = e.shot!;
        const { x, y } = toXY(s);
        const isLast = e === last && animate && !reduce;
        const fill = s.user ? '#f97316' : e.side === 'home' ? '#60a5fa' : '#e5e7eb';
        const mark = s.made ? (
          <circle cx={x} cy={y} r={s.user ? 5 : 3.5} fill={fill} opacity={s.user ? 1 : 0.65} />
        ) : (
          <g opacity={s.user ? 1 : 0.5} stroke={fill} strokeWidth={s.user ? 2 : 1.4}>
            <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
            <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} />
          </g>
        );
        // the newest shot appears when the ball arrives
        return isLast ? (
          <motion.g key={`${lastKey}-mark`} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.2 }} style={{ transformOrigin: `${x}px ${y}px` }}>
            {mark}
          </motion.g>
        ) : (
          <g key={i}>{mark}</g>
        );
      })}
      {last && animate && !reduce && <ShotFlight key={lastKey} shot={last.shot!} />}
    </svg>
  );
}

/** Top-down shot: the ball travels to the rim while its radius swells (height), then a ring bursts on a make. */
function ShotFlight({ shot }: { shot: NonNullable<PlayEvent['shot']> }) {
  const { x, y } = toXY(shot);
  const col = shot.made ? '#fde68a' : '#cbd5e1';
  return (
    <g pointerEvents="none">
      <motion.circle
        initial={{ cx: x, cy: y, r: 3, opacity: 1 }}
        animate={{ cx: [x, (x + BX) / 2, BX], cy: [y, (y + BY) / 2, BY], r: [3, 8, 4.5], opacity: [1, 1, shot.made ? 0 : 1] }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        fill="#f97316"
        stroke="#7a2f08"
        strokeWidth={0.8}
      />
      {shot.made ? (
        <motion.circle cx={BX} cy={BY} fill="none" stroke={col} strokeWidth={2} initial={{ r: 4, opacity: 0 }} animate={{ r: [4, 20], opacity: [0.95, 0] }} transition={{ delay: 0.5, duration: 0.55 }} />
      ) : (
        <motion.circle
          fill="#f97316"
          initial={{ cx: BX, cy: BY, r: 4.5, opacity: 0.95 }}
          animate={{ cx: [BX, BX + (x < BX ? -26 : 26)], cy: [BY, BY + 34], r: [4.5, 3], opacity: [0.95, 0] }}
          transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </g>
  );
}
