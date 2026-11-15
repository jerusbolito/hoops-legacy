import { chemistryLabel, chemistryMod, isCaptain } from '../../engine/chemistry';
import { useStore } from '../../state/store';
import { Meter, Panel, Pill } from './ui';

/** How the locker room is doing, and what it is worth on the court. */
export function ChemistryCard() {
  const game = useStore((s) => s.game)!;
  const v = game.career.chemistry;
  const mod = chemistryMod(game);
  return (
    <Panel title="Team chemistry" right={isCaptain(game) ? <Pill color="#fbbf24">Captain</Pill> : <span className="text-xs text-ink-500">{chemistryLabel(v)}</span>}>
      <Meter value={v} color={v >= 70 ? 'var(--color-win)' : v <= 40 ? 'var(--color-loss)' : '#38bdf8'} />
      <p className="mt-2 text-xs text-ink-400">
        {mod > 0 ? `A close team: everyone plays ${mod} point${mod > 1 ? 's' : ''} above their rating.` : mod < 0 ? `A team that is not getting along: everyone plays ${-mod} point${mod < -1 ? 's' : ''} below their rating.` : 'The room is fine. Wins, a strong leader and good moments make it better.'}
      </p>
    </Panel>
  );
}
