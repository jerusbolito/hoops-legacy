import { useState } from 'react';
import { useStore } from '../../state/store';
import { Button, Panel } from './ui';

const KEY = 'hoops.welcome.done';
const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** A short hello on the first week of a brand-new career. Shown once per device; the guide is always one tap away. */
export function WelcomeCard() {
  const game = useStore((s) => s.game)!;
  const setTab = useStore((s) => s.setTab);
  const [gone, setGone] = useState(seen);
  const c = game.career;
  if (gone || game.legacy.generation > 1 || c.season > 1 || c.week > 1) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private window: it just shows again next time */
    }
    setGone(true);
  };
  return (
    <Panel title="Welcome to your career" className="border-hoop-500/40">
      <ol className="space-y-1.5 text-sm text-ink-300">
        <li>
          <strong className="text-ink-100">1. Train.</strong> Pick one thing to work on this week. Rest if Energy is low.
        </li>
        <li>
          <strong className="text-ink-100">2. Live a moment.</strong> Something happens off the court. Your choice matters.
        </li>
        <li>
          <strong className="text-ink-100">3. Play the game.</strong> Choose a plan, then play it live or sim it.
        </li>
        <li>
          <strong className="text-ink-100">4. Wrap up.</strong> See what changed and move on to the next week.
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            close();
            setTab('help');
          }}
        >
          Open the guide
        </Button>
        <Button variant="ghost" onClick={close}>
          Got it
        </Button>
      </div>
    </Panel>
  );
}
