import { coachStanding } from '../../engine/coach';
import { useStore } from '../../state/store';
import { Meter, Panel } from './ui';

/** How the coach sees you, and what that means for your starting spot and minutes. */
export function CoachPanel() {
  const game = useStore((s) => s.game)!;
  const c = coachStanding(game);
  if (!c.hasCoach) return null;
  const moved = c.talentRank - c.rank;
  return (
    <Panel title="Coach's view" right={<span className="text-xs text-ink-400">{c.coachName}</span>}>
      <div className="space-y-2.5">
        <Meter label="Trust" value={c.trust} color={c.trust >= 60 ? 'var(--color-win)' : c.trust < 30 ? 'var(--color-loss)' : 'var(--color-hoop-500)'} />
        <Meter label="Respect" value={c.respect} color={c.respect >= 60 ? 'var(--color-win)' : c.respect < 30 ? 'var(--color-loss)' : 'var(--color-hoop-500)'} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-court-700 pt-3">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-ink-500 uppercase">Your role</div>
          <div className="font-display text-lg font-semibold">{c.label}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold tracking-widest text-ink-500 uppercase">Minutes</div>
          <div className="font-mono text-lg">~{c.minutes}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-400">{c.reason}</p>
      {moved !== 0 && (
        <p className="mt-1 text-xs text-ink-500">
          Depth chart: #{c.rank} (#{c.talentRank} on talent alone, {moved > 0 ? `${moved} up` : `${-moved} down`} because of trust).
        </p>
      )}
      <p className="mt-2 text-[11px] text-ink-500">Trust grows with good games, taking care of the ball, working in practice, and playing hurt when it matters. It falls with bad nights and turnovers.</p>
    </Panel>
  );
}
