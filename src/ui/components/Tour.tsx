import { useEffect, useState } from 'react';
import { useStore, type Tab } from '../../state/store';
import { Button } from './ui';

interface Step {
  title: string;
  text: string;
  tab: Tab;
  /** Things to light up, tried in order; the first one actually on screen wins. */
  targets?: string[];
}

export const TOUR_STEPS: Step[] = [
  { title: 'A quick tour', text: 'About a minute. You can leave any time with Skip, and the tour is always in the Guide if you want it later.', tab: 'hub' },
  { title: 'Energy, Morale and Rep', text: 'Energy is spent by training and games and restored by rest. Morale is how you feel, and it affects how you play. Rep is how the world sees you: it drives offers, recruiting and the draft.', tab: 'hub', targets: ['[data-tour="bars"]'] },
  { title: 'Your week', text: 'Every week has four steps: train, live a moment off the court, play the game, then wrap up. Once the season starts, a strip across the top shows which step you are on. The big panel is always what to do next.', tab: 'hub', targets: ['[data-tour="steps"]'] },
  { title: 'Games', text: 'Before a game you choose a plan, and the scouting card recommends one. In a live game you watch the play-by-play, and it stops at the big moments so you can choose what to do.', tab: 'hub' },
  { title: 'Goals', text: 'You always have three long-term goals. Finish one and a new one appears. They are how a career gets a shape.', tab: 'hub', targets: ['[data-tour="goals"]'] },
  { title: 'Your ratings', text: 'These nine ratings decide almost everything on the court. Hover a code like SHT to see what it means; the Guide lists them all. Below are your stats, career highs, badges and trophies.', tab: 'profile', targets: ['[data-tour="ratings"]'] },
  { title: 'The newspaper', text: 'A new edition prints every week: results, leaders, milestones and gossip. A dot appears on it when there is something new.', tab: 'paper' },
  { title: 'Stats and records', text: 'Every player in the league, basic and advanced, plus your own advanced game, the teams and the record books.', tab: 'stats' },
  { title: 'Finding your way around', text: 'The pages are in groups: Play, Career, League, Life and Guide. On a computer the groups run across the top. On a phone use the bottom bar, and More for the rest.', tab: 'hub', targets: ['[data-tour="menu"]'] },
  { title: 'That is it', text: 'Your progress saves after every action, and nothing here can be undone, so go and play. The Guide explains every screen, and this tour is there too.', tab: 'help' },
];

const pad = 6;
type Box = { top: number; left: number; width: number; height: number };

function findTarget(selectors: string[] | undefined): Element | null {
  for (const sel of selectors ?? []) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** A coach card that walks through the real screens, lighting up the real controls. It never blocks the page. */
export function Tour() {
  const step = useStore((s) => s.tour);
  const live = useStore((s) => !!s.live);
  const setTab = useStore((s) => s.setTab);
  const go = useStore((s) => s.tourStep);
  const [box, setBox] = useState<Box | null>(null);
  const def = step === null ? null : TOUR_STEPS[step];

  useEffect(() => {
    if (step === null || !def) return;
    setTab(def.tab);
    const place = () => {
      const el = findTarget(def.targets);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    // the page needs a moment to draw the tab we just opened
    const timers = [setTimeout(place, 60), setTimeout(place, 450)];
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && go(null);
    window.addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
      window.removeEventListener('keydown', onKey);
    };
  }, [step, def, setTab, go]);

  if (step === null || !def || live) return null;
  const last = step === TOUR_STEPS.length - 1;
  return (
    <>
      {box && <div aria-hidden className="pointer-events-none fixed z-[44] rounded-xl ring-2 ring-hoop-400 transition-all duration-200" style={{ ...box, boxShadow: '0 0 0 9999px rgba(2,6,23,0.6)' }} />}
      <section
        role="dialog"
        aria-label="Tour"
        className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[46] rounded-xl border border-hoop-500/50 bg-court-850 p-4 shadow-2xl lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-96"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-hoop-400">
            Tour · {step + 1} of {TOUR_STEPS.length}
          </div>
          <div className="flex gap-1" aria-hidden>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'h-1.5 w-4 rounded-full bg-hoop-500' : 'h-1.5 w-1.5 rounded-full bg-court-600'} />
            ))}
          </div>
        </div>
        <h2 className="mt-2 font-display text-lg font-semibold text-ink-100">{def.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-300">{def.text}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <Button variant="ghost" onClick={() => go(null)}>
              Skip
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={() => {
                if (last) {
                  go(null);
                  setTab('hub');
                } else go(step + 1);
              }}
            >
              {last ? 'Start playing' : step === 0 ? 'Begin' : 'Next →'}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
