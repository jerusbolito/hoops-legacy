import type { SeasonStory } from '../../engine/analytics';
import { useStore } from '../../state/store';
import { shade } from './color';
import { FormChart } from './charts';
import { HeatLegend, ShotChart } from './ShotChart';

/** Second page of the season recap: where you scored, how the year flowed, and what the narrator pinned. */
export function SeasonStoryCard({ story, colors, player }: { story: SeasonStory; colors: [string, string]; player: string }) {
  const game = useStore((s) => s.game);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-court-900/95 shadow-2xl">
      <div className="px-6 py-4" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${shade(colors[0], -0.7)})` }}>
        <div className="font-display text-xs tracking-[0.35em]" style={{ color: colors[1] }}>
          SEASON {story.season} · THE STORY
        </div>
        <div className="font-display text-2xl font-bold uppercase">{player}</div>
      </div>
      <div className="space-y-5 p-5">
        {story.shot.total > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-400 uppercase">Where you scored</h3>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[1fr_1fr]">
              <div>
                <ShotChart zones={story.shot.zones} total={story.shot.total} />
                <div className="mt-2">
                  <HeatLegend />
                </div>
              </div>
              <ul className="space-y-2 text-sm text-ink-300">
                {story.shootingNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {story.longestWinStreak >= 3 && <li>Longest win streak: {story.longestWinStreak} games.</li>}
              </ul>
            </div>
          </section>
        )}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-400 uppercase">How the year flowed</h3>
          <FormChart series={story.form} opponentName={(id) => game?.teams[id]?.name ?? 'Opponent'} />
        </section>
        {story.moments.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-400 uppercase">Moments that defined it</h3>
            <ul className="space-y-1.5 text-sm text-ink-300">
              {story.moments.map((m) => (
                <li key={m}>
                  <span className="mr-2 text-gold">★</span>
                  {m}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
