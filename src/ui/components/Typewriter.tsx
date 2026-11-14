import { useEffect, useRef, useState } from 'react';

/** Reveals narration progressively; click to finish instantly. */
export function Typewriter({ text, speed = 14, onDone, className }: { text: string; speed?: number; onDone?: () => void; className?: string }) {
  const [n, setN] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    setN(0);
    done.current = false;
  }, [text]);

  useEffect(() => {
    if (n >= text.length) {
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
      return;
    }
    const step = Math.max(1, Math.round(text.length / 900));
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + step * 2)), speed);
    return () => clearTimeout(t);
  }, [n, text, speed, onDone]);

  const shown = text.slice(0, n);
  return (
    <div className={`narration cursor-pointer ${className ?? ''}`} onClick={() => setN(text.length)} title="Click to skip">
      {shown.split(/\n{1,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {n < text.length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-hoop-500 align-middle" />}
    </div>
  );
}
