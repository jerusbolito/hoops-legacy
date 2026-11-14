import { motion } from 'framer-motion';
import type { PlayEvent } from '../../engine/gameSim';

/** Half-court SVG with a live shot chart. Basket at the top. */
export function Court({ events, color }: { events: PlayEvent[]; color: string }) {
  const W = 300;
  const H = 230;
  const shots = events.filter((e) => e.shot).slice(-60);
  const bx = W / 2;
  const by = 26;
  const scale = 300; // court units → px
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: 'linear-gradient(180deg,#3b2a1a,#2b1f14)' }}>
      <g stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} fill="none">
        <rect x={4} y={4} width={W - 8} height={H - 8} />
        <rect x={bx - 36} y={4} width={72} height={110} fill={`${color}33`} />
        <circle cx={bx} cy={114} r={36} />
        <path d={`M 22 4 L 22 70 A 140 140 0 0 0 ${W - 22} 70 L ${W - 22} 4`} />
        <circle cx={bx} cy={by} r={6} stroke="#f97316" strokeWidth={2} />
        <line x1={bx - 18} y1={by - 8} x2={bx + 18} y2={by - 8} strokeWidth={2.5} stroke="rgba(255,255,255,0.7)" />
        <path d={`M ${bx - 60} ${H - 4} A 60 60 0 0 1 ${bx + 60} ${H - 4}`} />
      </g>
      {shots.map((e, i) => {
        const s = e.shot!;
        const x = (s.x - 0.5) * scale + bx;
        const y = by + s.y * scale * 0.68;
        const fill = s.user ? '#f97316' : e.side === 'home' ? '#60a5fa' : '#e5e7eb';
        return s.made ? (
          <motion.circle key={i} cx={x} cy={y} r={s.user ? 5 : 3.5} fill={fill} initial={{ scale: 0 }} animate={{ scale: 1 }} opacity={s.user ? 1 : 0.65} />
        ) : (
          <motion.g key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} opacity={s.user ? 1 : 0.5} stroke={fill} strokeWidth={s.user ? 2 : 1.4}>
            <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
            <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} />
          </motion.g>
        );
      })}
    </svg>
  );
}
