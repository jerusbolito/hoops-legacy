import { useStore } from '../../state/store';
import { Panel, Pill } from '../components/ui';

export function StoryView() {
  const game = useStore((s) => s.game)!;
  const log = [...game.story.log].reverse();
  const arcs = game.story.arcs;
  const effects = [...game.effectLog].reverse().slice(0, 40);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {game.story.seasonSummaries.length > 0 && (
          <Panel title="Seasons">
            <ul className="space-y-3 text-sm text-ink-300">
              {game.story.seasonSummaries.map((s) => (
                <li key={s.season}>
                  <span className="mr-2 font-display font-semibold text-hoop-400">Season {s.season}</span>
                  {s.text}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="Story so far">
          {log.length === 0 ? (
            <p className="text-sm text-ink-500">Your story has not started yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-court-600 pl-5">
              {log.map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ${e.kind === 'game' ? 'bg-court-500' : 'bg-hoop-500'}`} />
                  <div className="text-[11px] uppercase tracking-wider text-ink-500">
                    Season {e.season} · {e.phase === 'regular' ? `Week ${e.week}` : e.phase} · {e.kind.replace(/_/g, ' ')}
                  </div>
                  <div className="font-semibold">{e.title}</div>
                  <div className="text-sm text-ink-300">{e.summary}</div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
      <div className="space-y-5">
        {game.story.defining.length > 0 && (
          <Panel title="Defining moments">
            <ul className="space-y-2 text-sm text-ink-300">
              {game.story.defining.map((d, i) => (
                <li key={i}>
                  <span className="mr-2 font-display font-semibold text-hoop-400">S{d.season}</span>
                  {d.text}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="Storylines">
          {arcs.length === 0 ? (
            <p className="text-sm text-ink-500">No storylines yet.</p>
          ) : (
            <ul className="space-y-3">
              {arcs.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.title}</span>
                    <Pill color={a.status === 'open' ? '#f97316' : '#22c55e'}>{a.status}</Pill>
                  </div>
                  <div className="text-ink-400">{a.stakes}</div>
                  {a.outcome && <div className="mt-0.5 text-xs text-win">→ {a.outcome}</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Change log">
          <p className="mb-2 text-xs text-ink-500">Every state change the story caused, checked and capped by the engine.</p>
          <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs scrollbar-thin">
            {effects.map((e, i) => (
              <li key={i} className="flex gap-2 text-ink-300">
                <span className="w-14 shrink-0 text-ink-500">
                  S{e.season}W{e.week}
                </span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
