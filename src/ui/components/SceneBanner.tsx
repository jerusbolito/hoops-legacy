import { AnimatePresence, motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { alpha, hashStr, safeId, shade } from './color';

export type Env = 'gym' | 'arena' | 'locker' | 'classroom' | 'home' | 'city' | 'park' | 'press' | 'rehab';

const ENV_BY_KIND: Record<string, Env> = {
  season_opener: 'gym',
  practice: 'gym',
  summer_workouts: 'park',
  rival_encounter: 'park',
  rivalry_week: 'gym',
  mentor: 'gym',
  low_point: 'gym',
  playoff_pressure: 'arena',
  aau_tournament: 'arena',
  scout_visit: 'arena',
  game: 'arena',
  locker_room: 'locker',
  team_drama: 'locker',
  school: 'classroom',
  campus: 'classroom',
  family: 'home',
  summer_break: 'home',
  social: 'city',
  city_life: 'city',
  date: 'city',
  nil_deal: 'press',
  media: 'press',
  agent_meeting: 'press',
  injury: 'rehab',
  consequence: 'city',
  reconcile: 'city',
  coach_meeting: 'gym',
  academics: 'classroom',
};

export const envFor = (kind: string): Env => ENV_BY_KIND[kind] ?? 'gym';

interface P {
  a: string; // team primary
  b: string; // team secondary
  id: string;
}

/** deterministic pseudo-random list so scenes don't reshuffle on re-render */
function rnd(seed: string, n: number) {
  let h = hashStr(seed);
  return Array.from({ length: n }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  });
}

const Beam = ({ x, w = 90, o = 0.1, d = 0 }: { x: number; w?: number; o?: number; d?: number }) => (
  <polygon className="beam" opacity={o * 0.6} style={{ animationDelay: `${d}s`, ['--o' as string]: o }} points={`${x},0 ${x + 14},0 ${x + w},150 ${x - w + 14},150`} fill="#fff" />
);

function Player({ x, y, jersey, s = 1, flip = false }: { x: number; y: number; jersey: string; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={0.92}>
      <circle cx={0} cy={-46} r={7} fill="#0b0f17" />
      <path d="M-9 -38 C-3 -42 5 -42 10 -36 L14 -14 L6 -12 L5 4 L8 34 L0 34 L-3 10 L-6 34 L-14 34 L-11 4 L-14 -12 L-8 -26Z" fill="#0b0f17" />
      <path d="M-8 -38 C-2 -41 4 -41 9 -36 L11 -22 L-8 -22Z" fill={jersey} opacity={0.9} />
      <path d="M10 -34 L22 -26 L26 -34" stroke="#0b0f17" strokeWidth={5} fill="none" strokeLinecap="round" />
      <circle cx={30} cy={-34} r={7} fill="#e8590c" />
      <path d="M23.5 -34 H36.5 M30 -41 V-27" stroke="#7a2f08" strokeWidth={0.9} />
    </g>
  );
}

function Gym({ a, b, id }: P) {
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      {/* bleachers */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={0} y={52 + i * 14} width={800} height={14} fill={shade(a, -0.82 + i * 0.05)} />
      ))}
      {rnd(id + 'g', 34).map((_r, i) => (
        <rect key={i} x={20 + i * 23.5} y={44 + (i % 4) * 14} width={10} height={9} rx={2} fill={alpha(i % 3 ? b : a, 0.28)} />
      ))}
      {/* banners */}
      {[120, 340, 560].map((x, i) => (
        <path key={x} d={`M${x} 0 V30 L${x + 22} 40 L${x + 44} 30 V0Z`} fill={i % 2 ? alpha(b, 0.55) : alpha(a, 0.75)} />
      ))}
      <Beam x={180} /><Beam x={430} d={1.2} /><Beam x={680} d={2.1} />
      {/* hoop */}
      <rect x={652} y={22} width={74} height={50} rx={3} fill="#fff" opacity={0.14} stroke="#fff" strokeOpacity={0.35} />
      <rect x={675} y={48} width={28} height={20} fill="none" stroke="#e8590c" strokeOpacity={0.7} />
      <ellipse cx={689} cy={76} rx={17} ry={4.5} fill="none" stroke="#e8590c" strokeWidth={2.4} />
      <path d="M673 77 L679 98 M689 80 V100 M705 77 L699 98 M680 88 H698" stroke="#fff" strokeOpacity={0.35} fill="none" />
      <rect x={686} y={72} width={6} height={110} fill="#2a3040" />
      {/* floor */}
      <polygon points="0,126 800,126 800,180 0,180" fill={`url(#wood${id})`} />
      <path d="M0 126 H800 M0 146 H800 M0 164 H800" stroke="#000" strokeOpacity={0.18} />
      <ellipse cx={400} cy={178} rx={190} ry={44} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={2} />
      <path d="M0 172 L130 128 M800 172 L670 128" stroke="#fff" strokeOpacity={0.16} strokeWidth={2} />
      <Player x={230} y={128} jersey={a} s={1.35} />
      <Player x={500} y={134} jersey={b} s={1.1} flip />
    </g>
  );
}

function Arena({ a, b, id }: P) {
  const crowd = rnd(id + 'c', 220);
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      {[0, 1, 2, 3, 4].map((row) =>
        Array.from({ length: 44 }, (_, i) => {
          const r = crowd[(row * 44 + i) % crowd.length];
          return <circle key={`${row}-${i}`} cx={10 + i * 18.4 + (row % 2) * 9} cy={36 + row * 15} r={4.2} fill={r > 0.7 ? alpha(b, 0.55) : r > 0.35 ? alpha(a, 0.55) : '#1b2233'} />;
        }),
      )}
      {/* big scoreboard */}
      <rect x={330} y={4} width={140} height={34} rx={6} fill="#05070c" stroke="#fff" strokeOpacity={0.25} />
      <text x={365} y={28} fontFamily="JetBrains Mono, monospace" fontSize={18} fill="#fbbf24" textAnchor="middle">
        00
      </text>
      <text x={435} y={28} fontFamily="JetBrains Mono, monospace" fontSize={18} fill="#fbbf24" textAnchor="middle">
        00
      </text>
      <Beam x={90} w={120} o={0.14} /><Beam x={330} w={130} o={0.16} d={0.7} /><Beam x={560} w={130} o={0.16} d={1.5} /><Beam x={730} w={110} o={0.14} d={2.2} />
      {/* court */}
      <polygon points="0,118 800,118 800,180 0,180" fill={`url(#wood${id})`} />
      <circle cx={400} cy={160} r={40} fill={alpha(a, 0.45)} stroke="#fff" strokeOpacity={0.4} strokeWidth={2} />
      <text x={400} y={166} textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize={20} fontWeight={700} fill="#fff" opacity={0.75}>
        LIVE
      </text>
      <path d="M0 150 H800" stroke="#fff" strokeOpacity={0.15} />
      <Player x={190} y={130} jersey={a} s={1.2} />
      <Player x={610} y={132} jersey={b} s={1.2} flip />
    </g>
  );
}

function Locker({ a, b, id }: P) {
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      {Array.from({ length: 13 }, (_, i) => (
        <g key={i} transform={`translate(${14 + i * 61} 22)`}>
          <rect width={54} height={118} rx={3} fill={i % 4 === 1 ? shade(a, -0.35) : '#222b3d'} stroke="#000" strokeOpacity={0.4} />
          {[10, 14, 18].map((y) => <path key={y} d={`M10 ${y} H44`} stroke="#000" strokeOpacity={0.35} />)}
          <rect x={8} y={50} width={38} height={5} rx={2} fill="#000" opacity={0.28} />
          <circle cx={44} cy={80} r={2.4} fill="#aab4c6" />
          {i % 3 === 0 && <rect x={14} y={-8} width={26} height={10} rx={2} fill={alpha(b, 0.7)} />}
        </g>
      ))}
      <rect x={0} y={142} width={800} height={38} fill="#10151f" />
      <rect x={90} y={148} width={300} height={10} rx={3} fill={shade(b, -0.35)} />
      <rect x={110} y={158} width={6} height={22} fill="#2a3040" /><rect x={360} y={158} width={6} height={22} fill="#2a3040" />
      {/* hanging jersey */}
      <path d="M560 20 L580 20 L586 34 L600 30 L604 56 L590 58 L590 100 L550 100 L550 58 L536 56 L540 30 L554 34Z" fill={a} stroke={b} strokeWidth={2} opacity={0.95} />
      <text x={570} y={86} textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize={22} fontWeight={700} fill={b}>
        {10 + (hashStr(id) % 30)}
      </text>
      <Beam x={200} w={120} o={0.1} /><Beam x={560} w={120} o={0.1} d={1.4} />
    </g>
  );
}

function Classroom({ a, b, id }: P) {
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      <rect x={60} y={16} width={300} height={96} rx={4} fill="#14301f" stroke="#7a5a35" strokeWidth={6} />
      <path d="M84 44 H220 M84 62 H280 M84 80 H190 M240 80 q10 -14 20 0 t20 0" stroke="#fff" strokeOpacity={0.5} strokeWidth={2} fill="none" strokeLinecap="round" />
      <rect x={420} y={18} width={70} height={90} rx={3} fill="#a5c8ff" opacity={0.28} stroke="#cbd5e1" strokeOpacity={0.5} />
      <rect x={520} y={18} width={70} height={90} rx={3} fill="#a5c8ff" opacity={0.28} stroke="#cbd5e1" strokeOpacity={0.5} />
      <path d="M455 18 V108 M555 18 V108 M420 63 H490 M520 63 H590" stroke="#cbd5e1" strokeOpacity={0.4} />
      <polygon points="420,108 490,108 560,180 360,180" fill="#fff" opacity={0.06} />
      <circle cx={700} cy={46} r={22} fill="#0d1220" stroke="#cbd5e1" strokeOpacity={0.6} strokeWidth={3} />
      <path d="M700 46 V32 M700 46 L710 52" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <rect x={0} y={128} width={800} height={52} fill="#0f1420" />
      {[90, 270, 450, 630].map((x, i) => (
        <g key={x}>
          <rect x={x} y={118} width={110} height={10} rx={3} fill={i === 1 ? shade(a, -0.1) : '#3a4358'} />
          <rect x={x + 8} y={128} width={5} height={36} fill="#232b3c" /><rect x={x + 97} y={128} width={5} height={36} fill="#232b3c" />
          <rect x={x + 22} y={104} width={26} height={14} rx={2} fill={b} opacity={0.7} />
        </g>
      ))}
    </g>
  );
}

function Home({ a, b, id }: P) {
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      <rect x={470} y={14} width={190} height={112} rx={4} fill={`url(#dusk${id})`} stroke="#6b5a45" strokeWidth={6} />
      {rnd(id + 'h', 14).map((r, i) => (
        <rect key={i} x={478 + i * 13} y={96 - r * 38} width={10} height={30 + r * 38} fill="#1a1020" opacity={0.85} />
      ))}
      <path d="M565 14 V126 M470 70 H660" stroke="#6b5a45" strokeWidth={3} />
      <circle cx={610} cy={38} r={9} fill="#fde68a" opacity={0.9} />
      {/* shelf with trophies */}
      <rect x={70} y={44} width={230} height={6} rx={2} fill="#5b4630" />
      {[96, 150, 206, 260].map((x, i) => (
        <g key={x}>
          <path d={`M${x - 8} 44 V30 q0 -8 8 -8 q8 0 8 8 V44Z`} fill={i % 2 ? '#fbbf24' : alpha(b, 0.9)} />
          <rect x={x - 6} y={40} width={12} height={4} fill="#fbbf24" />
        </g>
      ))}
      {[90, 160, 230].map((x) => <rect key={x} x={x} y={62} width={44} height={34} rx={2} fill="#1b2335" stroke="#6b5a45" strokeOpacity={0.7} />)}
      {/* lamp glow */}
      <circle cx={380} cy={86} r={70} fill="url(#glow${id})" />
      <path d="M372 70 L364 100 H396 L388 70Z" fill="#fde68a" opacity={0.85} />
      <rect x={378} y={100} width={4} height={36} fill="#5b4630" />
      {/* couch */}
      <rect x={90} y={118} width={240} height={50} rx={14} fill={shade(a, -0.4)} />
      <rect x={80} y={108} width={34} height={60} rx={12} fill={shade(a, -0.25)} /><rect x={306} y={108} width={34} height={60} rx={12} fill={shade(a, -0.25)} />
      <rect x={0} y={150} width={800} height={30} fill="#0f1420" opacity={0.55} />
      <circle cx={430} cy={160} r={13} fill="#e8590c" /><path d="M417 160 H443 M430 147 V173" stroke="#7a2f08" />
    </g>
  );
}

function City({ a, b, id }: P) {
  const bld = rnd(id + 'b', 30);
  const win = rnd(id + 'w', 260);
  return (
    <g>
      <rect width={800} height={180} fill={`url(#dusk${id})`} />
      {rnd(id + 's', 40).map((r, i) => <circle key={i} cx={r * 800} cy={(rnd(id + 't' + i, 1)[0]) * 70} r={0.9} fill="#fff" opacity={0.6} />)}
      <circle cx={650} cy={36} r={20} fill="#fef3c7" opacity={0.92} />
      <circle cx={658} cy={32} r={19} fill="#1a1a3a" opacity={0.35} />
      {bld.map((r, i) => {
        const w = 34 + r * 40;
        const x = i * 28 - 10;
        const h = 40 + r * 90;
        return (
          <g key={i}>
            <rect x={x} y={180 - h} width={w} height={h} fill={i % 3 === 0 ? '#12162a' : '#0c1020'} />
            {Array.from({ length: Math.floor(h / 14) }, (_, j) =>
              win[(i * 9 + j) % win.length] > 0.55 ? <rect key={j} x={x + 5 + (j % 3) * 10} y={180 - h + 6 + Math.floor(j / 3) * 14} width={5} height={7} fill={win[(i * 7 + j) % win.length] > 0.8 ? b : '#fde68a'} opacity={0.75} /> : null,
            )}
          </g>
        );
      })}
      <path d="M0 150 Q200 128 400 146 T800 132" stroke="#fde68a" strokeOpacity={0.55} strokeWidth={1.4} fill="none" strokeDasharray="2 8" />
      {[60, 240, 420, 600, 760].map((x) => <circle key={x} cx={x} cy={x % 3 ? 140 : 132} r={3.2} fill="#fde68a" />)}
      <rect x={0} y={162} width={800} height={18} fill="#05070c" opacity={0.7} />
      <rect x={0} y={160} width={800} height={2} fill={a} opacity={0.6} />
    </g>
  );
}

function Park({ a, b, id }: P) {
  const trees = rnd(id + 'p', 9);
  return (
    <g>
      <rect width={800} height={180} fill={`url(#dusk${id})`} />
      <circle cx={140} cy={104} r={64} fill={`url(#glow${id})`} />
      <circle cx={140} cy={108} r={22} fill="#fcd34d" opacity={0.9} />
      {/* tree line */}
      {trees.map((r, i) => (
        <g key={i} opacity={0.9}>
          <circle cx={30 + i * 92} cy={112 - r * 16} r={30 + r * 16} fill="#0b1a14" />
          <circle cx={62 + i * 92} cy={118 - r * 10} r={24 + r * 12} fill="#0e2119" />
        </g>
      ))}
      {/* chain-link fence */}
      <path d={`M0 96 H800 ${Array.from({ length: 27 }, (_, i) => `M${i * 30} 96 V150`).join(' ')}`} stroke="#9aa6b8" strokeOpacity={0.28} strokeWidth={1} fill="none" />
      <path d="M0 96 L800 150 M0 150 L800 96" stroke="#9aa6b8" strokeOpacity={0.1} strokeWidth={1} />
      {/* hoop on a pole */}
      <rect x={618} y={30} width={6} height={130} fill="#2a3040" />
      <rect x={594} y={34} width={56} height={38} rx={3} fill="#e5e7eb" opacity={0.85} stroke="#0b0f17" strokeOpacity={0.5} />
      <ellipse cx={622} cy={80} rx={15} ry={4} fill="none" stroke="#e8590c" strokeWidth={2.4} />
      <path d="M609 81 L614 100 M622 83 V102 M635 81 L630 100 M613 92 H631" stroke="#fff" strokeOpacity={0.4} fill="none" />
      {/* asphalt */}
      <polygon points="0,132 800,132 800,180 0,180" fill="#262a33" />
      <path d="M0 132 H800" stroke="#fff" strokeOpacity={0.1} />
      <ellipse cx={400} cy={170} rx={170} ry={30} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={2} />
      <rect x={0} y={174} width={800} height={6} fill={a} opacity={0.5} />
      <Player x={250} y={136} jersey={a} s={1.3} />
      <Player x={470} y={140} jersey={b} s={1.1} flip />
    </g>
  );
}

function Press({ a, b, id }: P) {
  const flash = rnd(id + 'f', 12);
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      {Array.from({ length: 9 }, (_, i) =>
        Array.from({ length: 3 }, (_, j) => (
          <g key={`${i}${j}`} transform={`translate(${30 + i * 92 + (j % 2) * 46} ${14 + j * 36})`} opacity={0.38}>
            <rect width={30} height={24} rx={5} fill={a} stroke={b} strokeWidth={1.4} />
            <text x={15} y={17} textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize={11} fontWeight={700} fill={b}>HL</text>
          </g>
        )),
      )}
      <rect x={0} y={120} width={800} height={60} fill="#0a0e17" />
      <path d="M300 180 L320 96 H480 L500 180Z" fill="#161d2e" stroke={a} strokeWidth={2} />
      <rect x={346} y={88} width={108} height={8} rx={3} fill="#0a0e17" />
      {[366, 400, 434].map((x) => (
        <g key={x}>
          <path d={`M${x} 88 V60`} stroke="#aab4c6" strokeWidth={2.4} />
          <ellipse cx={x} cy={56} rx={6} ry={8} fill="#0a0e17" stroke="#aab4c6" />
        </g>
      ))}
      {flash.map((r, i) => (
        <circle key={i} className="flash" opacity={0} style={{ animationDelay: `${r * 2.4}s`, animationDuration: `${1.4 + r * 1.6}s` }} cx={40 + (i % 6) * 135 + r * 40} cy={150 + (i % 2) * 14} r={2 + r * 2.5} fill="#fff" />
      ))}
    </g>
  );
}

function Rehab({ a, b, id }: P) {
  return (
    <g>
      <rect width={800} height={180} fill={`url(#sky${id})`} />
      <rect x={520} y={16} width={170} height={104} rx={4} fill="#2a3a55" opacity={0.7} stroke="#8aa0c0" strokeOpacity={0.5} strokeWidth={4} />
      {rnd(id + 'r', 22).map((r, i) => <path key={i} className="rain" opacity={0.5} style={{ animationDelay: `${r * 1.2}s` }} d={`M${528 + i * 7} ${20 + r * 60} l-3 14`} stroke="#bcd4ff" strokeOpacity={0.5} strokeWidth={1.2} />)}
      <path d="M605 16 V120" stroke="#8aa0c0" strokeOpacity={0.5} strokeWidth={3} />
      <rect x={90} y={96} width={290} height={22} rx={7} fill="#cbd5e1" opacity={0.85} />
      <rect x={104} y={118} width={8} height={50} fill="#64748b" /><rect x={358} y={118} width={8} height={50} fill="#64748b" />
      <rect x={90} y={88} width={90} height={12} rx={6} fill="#e2e8f0" opacity={0.9} />
      <path d="M420 60 q16 -34 34 0 t34 0" stroke={b} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.85} />
      <rect x={50} y={40} width={8} height={90} fill="#475569" /><rect x={50} y={40} width={70} height={6} fill="#475569" />
      <rect x={104} y={44} width={22} height={32} rx={5} fill={alpha(a, 0.8)} />
      <rect x={0} y={150} width={800} height={30} fill="#0a0e17" opacity={0.6} />
    </g>
  );
}

const ENVS: Record<Env, (p: P) => ReactNode> = { gym: Gym, arena: Arena, locker: Locker, classroom: Classroom, home: Home, city: City, park: Park, press: Press, rehab: Rehab };
const SKY: Record<Env, [number, number]> = {
  gym: [-0.78, -0.9],
  arena: [-0.84, -0.94],
  locker: [-0.8, -0.9],
  classroom: [-0.84, -0.93],
  home: [-0.84, -0.93],
  city: [-0.6, -0.92],
  park: [-0.6, -0.92],
  press: [-0.84, -0.94],
  rehab: [-0.8, -0.92],
};

export function SceneBanner({ kind, colors, className = '', height = 150 }: { kind: string; colors: [string, string]; className?: string; height?: number }) {
  const id = safeId(useId());
  const env = envFor(kind);
  const [top, bottom] = SKY[env];
  const Art = ENVS[env];
  const a = colors[0];
  const b = colors[1];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height }}>
      <AnimatePresence mode="wait">
        <motion.svg
          key={env + kind}
          viewBox="0 0 800 180"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          aria-hidden
        >
          <defs>
            <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={shade(a, top)} />
              <stop offset="1" stopColor={shade(a, bottom)} />
            </linearGradient>
            <linearGradient id={`wood${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8a5f33" />
              <stop offset="1" stopColor="#4a3018" />
            </linearGradient>
            <linearGradient id={`dusk${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1b1b45" />
              <stop offset="0.7" stopColor={shade(a, -0.55)} />
              <stop offset="1" stopColor={shade(b, -0.6)} />
            </linearGradient>
            <radialGradient id={`glow${id}`}>
              <stop offset="0" stopColor="#fde68a" stopOpacity={0.5} />
              <stop offset="1" stopColor="#fde68a" stopOpacity={0} />
            </radialGradient>
          </defs>
          <Art a={a} b={b} id={id} />
        </motion.svg>
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-court-850 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/25" />
    </div>
  );
}
