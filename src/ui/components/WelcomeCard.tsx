import { useStore } from '../../state/store';
import { Button, Panel } from './ui';

/**
 * Offered once on the first week of every brand-new career (not heirs): a tour, or straight to playing. Which of the two you
 * pick is remembered in the save, and the tour is always in the Guide afterwards.
 */
export function WelcomeCard() {
  const game = useStore((s) => s.game)!;
  const touring = useStore((s) => s.tour !== null);
  const start = useStore((s) => s.startTour);
  const decline = useStore((s) => s.declineTour);
  const c = game.career;
  if (touring || game.story.flags.tour_offered === true || game.legacy.generation > 1 || c.season > 1 || c.week > 1) return null;
  return (
    <Panel title="Welcome to your career" className="border-hoop-500/40">
      <p className="text-sm text-ink-300">Want a one-minute tour? It walks you through the week, your ratings, the paper and the menu, with the real controls lit up.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={start}>Take the tour</Button>
        <Button variant="ghost" onClick={decline}>
          No thanks, I will explore
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-500">Changed your mind later? It is always in the Guide.</p>
    </Panel>
  );
}
