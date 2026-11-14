import { memo, useId, useMemo } from 'react';
import { FEMALE_FIRST } from '../../data/names';
import { RNG } from '../../engine/rng';
import { alpha, hashStr, safeId, shade } from './color';

export type Mood = 'happy' | 'neutral' | 'angry' | 'sad';
type HairStyle = 'buzz' | 'short' | 'waves' | 'afro' | 'bald' | 'braids' | 'bun' | 'long' | 'ponytail' | 'cap';

const SKIN = ['#f6d7b8', '#eac29a', '#d9a273', '#c18454', '#a2673d', '#7b4a2a', '#5a3420', '#3f2417'];
const HAIR = [
  { c: '#14100e', w: 5 },
  { c: '#2a1a10', w: 4 },
  { c: '#4a2e1b', w: 3 },
  { c: '#7a4a25', w: 2 },
  { c: '#b9803c', w: 1.2 },
  { c: '#d9b36a', w: 0.8 },
  { c: '#9a9a9a', w: 0.4 },
];
const STYLES_A: HairStyle[] = ['buzz', 'short', 'short', 'waves', 'afro', 'bald', 'braids', 'cap', 'short'];
const STYLES_B: HairStyle[] = ['long', 'long', 'bun', 'ponytail', 'short', 'afro', 'braids', 'waves'];

export interface Look {
  skin: string;
  hair: string;
  style: HairStyle;
  number: string;
  hue: number;
  bgHue: number;
}

/** Same name always gives the same face. */
export function lookFor(name: string): Look {
  const rng = new RNG(hashStr(name));
  const first = name.split(' ')[0];
  const styles = FEMALE_FIRST.includes(first) ? STYLES_B : STYLES_A;
  return {
    skin: rng.pick(SKIN),
    hair: rng.weighted(HAIR, (h) => h.w).c,
    style: rng.pick(styles),
    number: String(rng.int(0, 45)),
    hue: rng.int(0, 359),
    bgHue: rng.int(0, 359),
  };
}

function HairBack({ style, color }: { style: HairStyle; color: string }) {
  if (style === 'afro') return <circle cx={32} cy={21} r={19.5} fill={color} />;
  if (style === 'long') return <path d="M15 30 C11 12 53 12 49 30 C52 42 50 52 47 58 L17 58 C14 52 12 42 15 30Z" fill={color} />;
  if (style === 'bun') return <circle cx={32} cy={9.5} r={6} fill={color} />;
  if (style === 'ponytail') return <path d="M45 20 C57 18 58 36 50 44 C53 34 50 27 45 26Z" fill={color} />;
  return null;
}

function HairFront({ style, color, cap }: { style: HairStyle; color: string; cap: string }) {
  const light = shade(color, 0.25);
  switch (style) {
    case 'bald':
      return <ellipse cx={28} cy={18} rx={5} ry={2.5} fill="#fff" opacity={0.12} />;
    case 'buzz':
      return <path d="M17.5 27 C17 14 47 14 46.5 27 C44 22 40 20 32 20 C24 20 20 22 17.5 27Z" fill={color} opacity={0.9} />;
    case 'cap':
      return (
        <g>
          <path d="M16 27 C16 9 48 9 48 27Z" fill={cap} />
          <ellipse cx={32} cy={27} rx={19.5} ry={3.4} fill={shade(cap, -0.25)} />
          <circle cx={32} cy={12} r={1.4} fill={shade(cap, 0.3)} />
        </g>
      );
    case 'afro':
      return <path d="M17 25 C15 10 49 10 47 25 C44 20 40 17 32 17 C24 17 20 20 17 25Z" fill={color} />;
    case 'long':
      return <path d="M16.5 29 C14 11 50 11 47.5 29 C46 22 38 17 28 19 C22 20 18 23 16.5 29Z" fill={color} />;
    case 'braids':
      return (
        <g>
          <path d="M16.5 29 C14.5 11 49.5 11 47.5 29 C45.5 22 41 18.5 32 18.5 C23 18.5 18.5 22 16.5 29Z" fill={color} />
          {[20, 24.5, 29, 33.5, 38, 42.5].map((x) => (
            <path key={x} d={`M${x} 14.5 L${x + (x < 32 ? -1.2 : 1.2)} 21`} stroke={light} strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
          ))}
        </g>
      );
    case 'waves':
      return (
        <g>
          <path d="M16.5 29 C14.5 11 49.5 11 47.5 29 C45.5 22 41 18.5 32 18.5 C23 18.5 18.5 22 16.5 29Z" fill={color} />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M20 ${17 + i * 2} Q26 ${14.5 + i * 2} 32 ${17 + i * 2} T44 ${17 + i * 2}`} stroke={light} strokeWidth={0.6} fill="none" opacity={0.5} />
          ))}
        </g>
      );
    default:
      return <path d="M16.5 29 C14.5 11 49.5 11 47.5 29 C45.5 22 41 18.5 32 18.5 C23 18.5 18.5 22 16.5 29Z" fill={color} />;
  }
}

function Face({ mood, eye }: { mood: Mood; eye: string }) {
  const brows =
    mood === 'angry' ? (
      <>
        <path d="M22.5 24.6 L29.5 27" stroke={eye} strokeWidth={1.5} strokeLinecap="round" />
        <path d="M41.5 24.6 L34.5 27" stroke={eye} strokeWidth={1.5} strokeLinecap="round" />
      </>
    ) : mood === 'sad' ? (
      <>
        <path d="M22.5 27 L29.5 25" stroke={eye} strokeWidth={1.3} strokeLinecap="round" />
        <path d="M41.5 27 L34.5 25" stroke={eye} strokeWidth={1.3} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M22.5 26 Q26 24 29.5 25.6" stroke={eye} strokeWidth={1.3} strokeLinecap="round" fill="none" />
        <path d="M41.5 26 Q38 24 34.5 25.6" stroke={eye} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      </>
    );
  const mouth =
    mood === 'happy' ? (
      <path d="M26.5 38 Q32 44 37.5 38" stroke="#5a2a22" strokeWidth={1.6} strokeLinecap="round" fill="#fff" fillOpacity={0.9} />
    ) : mood === 'angry' ? (
      <path d="M27 40.5 Q32 36.5 37 40.5" stroke="#5a2a22" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    ) : mood === 'sad' ? (
      <path d="M27.5 40.5 Q32 37.5 36.5 40.5" stroke="#5a2a22" strokeWidth={1.4} strokeLinecap="round" fill="none" />
    ) : (
      <path d="M28 39 Q32 40.4 36 39" stroke="#5a2a22" strokeWidth={1.5} strokeLinecap="round" fill="none" />
    );
  return (
    <g>
      {brows}
      <ellipse cx={26} cy={31} rx={1.7} ry={mood === 'happy' ? 1.3 : 1.8} fill={eye} />
      <ellipse cx={38} cy={31} rx={1.7} ry={mood === 'happy' ? 1.3 : 1.8} fill={eye} />
      <circle cx={26.6} cy={30.3} r={0.55} fill="#fff" opacity={0.8} />
      <circle cx={38.6} cy={30.3} r={0.55} fill="#fff" opacity={0.8} />
      <path d="M31 33 Q32.6 36 33.8 35.4" stroke="#000" strokeOpacity={0.18} strokeWidth={1} fill="none" strokeLinecap="round" />
      {mouth}
    </g>
  );
}

export const Portrait = memo(function Portrait({
  name,
  size = 40,
  ring,
  colors,
  mood = 'neutral',
}: {
  name: string;
  size?: number;
  ring?: string;
  /** Team colors for a jersey (and cap). Omit for casual clothes. */
  colors?: [string, string];
  mood?: Mood;
}) {
  const uid = safeId(useId());
  const look = useMemo(() => lookFor(name), [name]);
  const { skin } = look;
  const skinDark = shade(skin, -0.14);
  const jersey = colors?.[0] ?? `hsl(${look.hue} 38% 36%)`;
  const trim = colors?.[1] ?? `hsl(${look.hue} 30% 55%)`;
  const bgA = `hsl(${look.bgHue} 40% 32%)`;
  const bgB = `hsl(${look.bgHue} 45% 13%)`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={name}
      className="shrink-0 rounded-full"
      style={{ boxShadow: ring ? `0 0 0 2px ${ring}` : undefined, background: bgB }}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={bgA} />
          <stop offset="1" stopColor={bgB} />
        </radialGradient>
        <clipPath id={`clip${uid}`}>
          <circle cx={32} cy={32} r={32} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${uid})`}>
        <rect width={64} height={64} fill={`url(#bg${uid})`} />
        <HairBack style={look.style} color={look.hair} />
        {/* shoulders */}
        <path d="M4 66 C6 49 19 45 32 45 C45 45 58 49 60 66Z" fill={jersey} />
        <path d="M24 45.5 L32 55 L40 45.5 C37 44.6 35 44.3 32 44.3 C29 44.3 27 44.6 24 45.5Z" fill={trim} opacity={0.95} />
        {colors && (
          <text x={32} y={63} textAnchor="middle" fontSize={8} fontWeight={700} fontFamily="Oswald, sans-serif" fill={trim} opacity={0.9}>
            {look.number}
          </text>
        )}
        {/* neck + ears + head */}
        <rect x={27} y={37} width={10} height={11} rx={4} fill={skinDark} />
        <circle cx={16.8} cy={31} r={3} fill={skinDark} />
        <circle cx={47.2} cy={31} r={3} fill={skinDark} />
        <ellipse cx={32} cy={30} rx={15} ry={17} fill={skin} />
        <ellipse cx={32} cy={44.5} rx={9} ry={2.2} fill="#000" opacity={0.12} />
        <Face mood={mood} eye="#1d1410" />
        <HairFront style={look.style} color={look.hair} cap={colors?.[0] ?? jersey} />
        <ellipse cx={24} cy={21} rx={6} ry={2.4} fill={alpha('#ffffff', 0.12)} />
      </g>
    </svg>
  );
});
