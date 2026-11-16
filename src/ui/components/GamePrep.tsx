import { canPlayHurt, isPlayingHurt, sitOutReason, AGGRAVATE_CHANCE, HURT_PENALTY, MIN_GPA } from '../../engine/consequences';
import { nextOpponent } from '../../engine/career';
import { FILM_BONUS, FILM_ENERGY_COST, PLANS, scoutOpponent } from '../../engine/gameplan';
import { useStore } from '../../state/store';
import { Panel, Pill, cx } from './ui';

/** Everything you can do before tip-off: read the opponent, pick an approach, watch film, decide whether to play hurt. */
export function GamePrep() {
  const game = useStore((s) => s.game)!;
  const setPlan = useStore((s) => s.setPlan);
  const setHurt = useStore((s) => s.setHurt);
  const next = nextOpponent(game);
  if (!next) return null;

  const scout = scoutOpponent(game, next.opp.id);
  const plan = game.career.plan;
  const picked = plan?.id ?? 'balanced';
  const film = !!plan?.film;
  const blocked = sitOutReason(game);
  const hurtPossible = canPlayHurt(game);
  const playingHurt = isPlayingHurt(game);

  return (
    <div className="space-y-4">
      {blocked && (
        <div className="rounded-xl border border-loss/40 bg-loss/10 p-4 text-sm">
          <div className="font-semibold text-loss">You are not cleared to play</div>
          <p className="mt-1 text-ink-300">{blocked}</p>
          {game.career.level !== 'pro' && game.player.academics < MIN_GPA && <p className="mt-1 text-ink-400">Spend your training time on "Hit the Books" to get your GPA back above {MIN_GPA.toFixed(1)}.</p>}
        </div>
      )}

      {hurtPossible && (
        <div className={cx('rounded-xl border p-4 text-sm', playingHurt ? 'border-hoop-500/60 bg-hoop-500/10' : 'border-court-600 bg-court-800/50')}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-hoop-500" checked={playingHurt} onChange={(e) => setHurt(e.target.checked)} />
            <span>
              <span className="font-semibold">Play through the {game.player.injury?.desc}</span>
              <span className="mt-1 block text-ink-400">
                Your ratings drop by {HURT_PENALTY} this game and there is a {Math.round(AGGRAVATE_CHANCE * 100)}% chance you make it worse (two more weeks out). Your coach and teammates will respect it.
              </span>
            </span>
          </label>
        </div>
      )}

      <Panel
        title="Scouting report"
        right={
          <span className="font-mono text-xs text-ink-400">
            {scout.teamName} · {scout.record}
          </span>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Pill color={scout.style === 'perimeter' ? '#38bdf8' : scout.style === 'interior' ? '#f97316' : undefined}>{scout.style === 'perimeter' ? 'Live by the jumper' : scout.style === 'interior' ? 'Pound it inside' : 'Balanced'}</Pill>
          <Pill>Defense avg {Math.round(scout.avgDefense)}</Pill>
          {scout.rivalName && <Pill color="#ef4444">Rival: {scout.rivalName}</Pill>}
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] tracking-wider text-ink-500 uppercase">
            <tr className="border-b border-court-700 text-right">
              <th className="py-1 text-left font-semibold">Their best five</th>
              <th className="font-semibold">POS</th>
              <th className="font-semibold">OVR</th>
              <th className="font-semibold">SHO</th>
              <th className="font-semibold">FIN</th>
              <th className="font-semibold">DEF</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {scout.top.map((p) => (
              <tr key={p.name} className="border-b border-court-800 text-right">
                <td className="py-1 text-left font-sans">
                  {p.name} {scout.bestDefender?.name === p.name && <span title="Best defender in their rotation">🛡️</span>}
                  {scout.weakDefender?.name === p.name && <span title="Weakest defender in their rotation: a target">🎯</span>}
                </td>
                <td className="text-ink-400">{p.position}</td>
                <td className="text-ink-100">{p.ovr}</td>
                <td>{p.shooting}</td>
                <td>{p.finishing}</td>
                <td className={p.defense >= scout.avgDefense + 6 ? 'text-hoop-400' : p.defense <= scout.avgDefense - 6 ? 'text-win' : ''}>{p.defense}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-500">🛡️ best defender in their rotation · 🎯 weakest defender, a good one to go at</p>
      </Panel>

      <Panel title="Game plan" right={<span className="text-xs text-ink-500">free</span>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Game plan">
          {PLANS.map((p) => {
            const active = picked === p.id;
            const rec = scout.recommended === p.id;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={active}
                onClick={() => setPlan(p.id, film)}
                className={cx('rounded-lg border p-3 text-left transition-colors', active ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 bg-court-800/40 hover:border-court-500')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.icon}</span>
                  <span className="font-semibold">{p.name}</span>
                  {rec && <Pill color="#22c55e">Recommended</Pill>}
                </div>
                <div className="mt-0.5 text-xs text-ink-400">{p.blurb}</div>
                <div className="mt-1 text-xs text-ink-300">{p.effect}</div>
              </button>
            );
          })}
        </div>
        {scout.reasons.length > 0 && (
          <p className="mt-3 text-xs text-ink-400">
            <span className="font-semibold text-ink-300">Why: </span>
            {scout.reasons.join(' ')}
          </p>
        )}
        <label className={cx('mt-3 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', film ? 'border-hoop-500/60 bg-hoop-500/10' : 'border-court-600 bg-court-800/40')}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-hoop-500" checked={film} onChange={(e) => setPlan(picked, e.target.checked)} />
          <span>
            <span className="font-semibold">🎬 Study film</span>
            <span className="ml-2 font-mono text-xs text-ink-400">−{FILM_ENERGY_COST} energy</span>
            <span className="mt-0.5 block text-xs text-ink-400">You know their sets before they run them. Every shot and key moment option is +{Math.round(FILM_BONUS * 100)}%. Untick before tip-off to get the energy back.</span>
          </span>
        </label>
      </Panel>
    </div>
  );
}
