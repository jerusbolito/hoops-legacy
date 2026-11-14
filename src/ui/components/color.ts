/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color; returns an rgb() string. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** SVG ids from React's useId contain colons, which break url(#id) references in some browsers. */
export const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '');

/** WCAG relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Button colors for a team on a dark backdrop: never invisible, text always readable. */
export function buttonColors(colors: [string, string]): { bg: string; fg: string } {
  const bg = luminance(colors[0]) < 0.06 ? colors[1] : colors[0];
  return { bg, fg: luminance(bg) > 0.4 ? '#0b0f17' : '#ffffff' };
}
