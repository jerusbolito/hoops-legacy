import { usePrefs } from '../state/prefs';

/**
 * Sound effects made in the browser (no audio files). Everything is quiet by default,
 * does nothing until the player has interacted with the page, and respects the mute toggle.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!usePrefs.getState().sound) return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'closed' ? null : ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function tone(c: AudioContext, { f, to, at = 0, dur = 0.15, type = 'sine', vol = 0.12 }: { f: number; to?: number; at?: number; dur?: number; type?: OscillatorType; vol?: number }) {
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function hiss(c: AudioContext, { at = 0, dur = 0.3, from = 1200, to = 4000, vol = 0.1, q = 0.8, attack = 0.02 }: { at?: number; dur?: number; from?: number; to?: number; vol?: number; q?: number; attack?: number }) {
  const t0 = c.currentTime + at;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Ball through the net. */
  swish() {
    const c = audio();
    if (c) hiss(c, { dur: 0.22, from: 3000, to: 7000, vol: 0.09, q: 1.2 });
  },
  /** Rim clank on a miss. */
  rim() {
    const c = audio();
    if (!c) return;
    tone(c, { f: 420, to: 180, dur: 0.18, type: 'triangle', vol: 0.1 });
    hiss(c, { dur: 0.08, from: 1500, to: 900, vol: 0.05 });
  },
  /** Crowd swell for a big moment. */
  cheer(intensity = 1) {
    const c = audio();
    if (c) hiss(c, { dur: 1.1 + intensity * 0.5, from: 500, to: 1400, vol: 0.05 * intensity, q: 0.5, attack: 0.35 });
  },
  /** End-of-game buzzer. */
  buzzer() {
    const c = audio();
    if (!c) return;
    tone(c, { f: 220, dur: 0.9, type: 'sawtooth', vol: 0.09 });
    tone(c, { f: 225, dur: 0.9, type: 'square', vol: 0.05 });
  },
  /** Soft click for choices and buttons. */
  click() {
    const c = audio();
    if (c) tone(c, { f: 640, to: 480, dur: 0.05, type: 'triangle', vol: 0.06 });
  },
  /** Card slides in. */
  whoosh() {
    const c = audio();
    if (c) hiss(c, { dur: 0.28, from: 400, to: 3000, vol: 0.06, q: 0.6, attack: 0.1 });
  },
  /** Something good: rating up, success. */
  chime() {
    const c = audio();
    if (!c) return;
    tone(c, { f: 660, dur: 0.18, vol: 0.08 });
    tone(c, { f: 880, at: 0.09, dur: 0.2, vol: 0.08 });
    tone(c, { f: 1320, at: 0.18, dur: 0.32, vol: 0.07 });
  },
  /** Something went wrong: failed moment, injury. */
  thud() {
    const c = audio();
    if (!c) return;
    tone(c, { f: 150, to: 60, dur: 0.25, type: 'sine', vol: 0.16 });
    tone(c, { f: 330, to: 220, at: 0.02, dur: 0.22, type: 'triangle', vol: 0.05 });
  },
  /** Trophy / draft fanfare. */
  fanfare() {
    const c = audio();
    if (!c) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { f, at: i * 0.11, dur: 0.3, type: 'triangle', vol: 0.08 }));
    hiss(c, { at: 0.2, dur: 1.4, from: 600, to: 1600, vol: 0.05, q: 0.5, attack: 0.4 });
  },
};

/** Short vibration on phones, when enabled. */
export function buzz(pattern: number | number[] = 20) {
  if (!usePrefs.getState().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
