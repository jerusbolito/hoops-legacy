import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

/** One-shot confetti burst on a full-screen canvas. Skipped for reduced-motion users. */
export function Confetti({ colors, count = 150, duration = 4200, from = 'top' }: { colors: string[]; count?: number; duration?: number; from?: 'top' | 'center' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduce) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;
    const palette = [...colors, '#fbbf24', '#ffffff'];
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      const burst = from === 'center';
      const ang = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      return {
        x: burst ? W() / 2 : Math.random() * W(),
        y: burst ? H() * 0.45 : -20 - Math.random() * H() * 0.4,
        vx: burst ? Math.cos(ang) * sp : (Math.random() - 0.5) * 3,
        vy: burst ? Math.sin(ang) * sp - 4 : 2 + Math.random() * 4,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: palette[i % palette.length],
        life: 0,
      };
    });

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W(), H());
      const fade = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      for (const p of pieces) {
        p.vy += 0.14;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [colors, count, duration, from, reduce]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden />;
}
