import { useId } from 'react';
import { safeId, shade } from './color';

/** A basketball jersey in team colors. Pure SVG so it can sit inside a downloadable card. */
export function Jersey({ colors, number, name, size = 120 }: { colors: [string, string]; number: string; name?: string; size?: number }) {
  const uid = safeId(useId());
  const [a, b] = colors;
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} role="img" aria-label={`Jersey number ${number}`}>
      <defs>
        <linearGradient id={`${uid}j`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(a, 0.12)} />
          <stop offset="1" stopColor={shade(a, -0.18)} />
        </linearGradient>
      </defs>
      <path d="M30 6 C34 22 66 22 70 6 L88 14 L96 38 L82 44 L82 104 L18 104 L18 44 L4 38 L12 14 Z" fill={`url(#${uid}j)`} stroke={shade(a, -0.4)} strokeWidth={1.5} />
      <path d="M30 6 C34 22 66 22 70 6" fill="none" stroke={b} strokeWidth={4} strokeLinecap="round" />
      <path d="M12 14 L4 38 M88 14 L96 38" stroke={b} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M18 98 H82" stroke={b} strokeWidth={4} />
      {name && (
        <text x="50" y="36" textAnchor="middle" fontSize="8" fontWeight="700" fill={b} letterSpacing="1.5">
          {name.toUpperCase().slice(0, 10)}
        </text>
      )}
      <text x="50" y="76" textAnchor="middle" fontSize="40" fontWeight="800" fill={b} stroke={shade(a, -0.35)} strokeWidth={1} paintOrder="stroke" fontFamily="system-ui, sans-serif">
        {number}
      </text>
    </svg>
  );
}
