// Draws the app icon (a basketball) as a 512x512 PNG using only Node. Run with: npm run icon
// electron-builder turns build/icon.png into the Windows, macOS and Linux icon formats.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const C = SIZE / 2;
const R = 236;
const SS = 3; // samples per pixel side, for smooth edges

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ORANGE_HI = [253, 150, 70];
const ORANGE = [249, 115, 22];
const ORANGE_LO = [176, 62, 10];
const SEAM = [32, 18, 8];

/** Distance from (x, y) to a ring of radius r centred at (cx, cy). */
const ring = (x, y, cx, cy, r) => Math.abs(Math.hypot(x - cx, y - cy) - r);

/** Colour (with alpha) at one point of the ball, or null outside it. */
function sample(x, y) {
  const d = Math.hypot(x - C, y - C);
  if (d > R) return null;
  // lit from the upper left
  const lit = Math.max(0, 1 - Math.hypot(x - (C - 90), y - (C - 100)) / (R * 1.5));
  let col = mix(ORANGE_LO, ORANGE_HI, Math.min(1, lit * 1.15));
  col = mix(col, ORANGE, 0.35);
  const seamW = 6;
  const onSeam =
    Math.abs(x - C) < seamW ||
    Math.abs(y - C) < seamW ||
    ring(x, y, C - R * 1.35, C, R * 0.8) < seamW ||
    ring(x, y, C + R * 1.35, C, R * 0.8) < seamW ||
    d > R - 9; // the outline
  return onSeam ? SEAM : col;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // no row filter
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, hit = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (c) {
          r += c[0]; g += c[1]; b += c[2]; hit++;
        }
      }
    }
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    if (hit) {
      raw[o] = Math.round(r / hit);
      raw[o + 1] = Math.round(g / hit);
      raw[o + 2] = Math.round(b / hit);
      raw[o + 3] = Math.round((hit / (SS * SS)) * 255);
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`Wrote build/icon.png (${png.length} bytes)`);
