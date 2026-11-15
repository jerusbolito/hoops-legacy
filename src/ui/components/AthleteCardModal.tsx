import { AnimatePresence, motion } from 'framer-motion';
import { athleteCard, type AthleteCard } from '../../engine/athleteCard';
import { STAT_BY_KEY, fmtStat, type StatKey } from '../../engine/leaders';
import { fmtPct } from '../../engine/stats';
import { useStore } from '../../state/store';
import { Avatar, Meter, Pill, TeamBadge, cx } from './ui';
import { tierFor } from './PlayerCard';

const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`);

const TAG_COLOR: Record<string, string> = { You: '#fb923c', Rival: '#ef4444', 'Best friend': '#22c55e', Teammate: '#38bdf8', 'All-Star': '#fbbf24', 'Your recruiting target': '#a78bfa', 'Signed by you': '#22c55e' };

function Tile({ label, value, rank }: { label: string; value: string; rank?: number | null }) {
  return (
    <div className="rounded-lg border border-court-700 bg-court-800/50 px-2 py-2 text-center">
      <div className="text-[10px] font-semibold tracking-widest text-ink-500 uppercase">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className={cx('h-4 text-[10px]', rank && rank <= 3 ? 'font-semibold text-gold' : rank && rank <= 10 ? 'text-win' : 'text-ink-500')}>{rank ? `#${rank} in the league` : ''}</div>
    </div>
  );
}

function Body({ card }: { card: AthleteCard }) {
  const tier = tierFor(card.ovr);
  const s = card.season;
  const r = (k: StatKey) => card.ranks[k] ?? null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={card.name} size={76} ring={card.team?.colors[0]} colors={card.team?.colors} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl leading-tight font-semibold">{card.name}</h2>
            {card.tags.map((t) => (
              <Pill key={t} color={TAG_COLOR[t]}>
                {t}
              </Pill>
            ))}
          </div>
          <div className="text-sm text-ink-300">
            {card.position} · {card.archetype} · {card.height} · {card.classText}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-400">
            {card.team ? (
              <>
                <TeamBadge team={card.team} size={22} />
                <span>
                  {card.team.name} {card.team.mascot}
                </span>
                <span className="text-ink-500">· {card.levelText}</span>
              </>
            ) : (
              <span>{card.levelText}</span>
            )}
          </div>
          <div className="text-xs text-ink-500">{card.teamRank ? `#${card.teamRank} on the roster: ${card.role}` : card.role}</div>
        </div>
        <div className="shrink-0 rounded-xl px-3 py-2 text-center" style={{ background: `linear-gradient(135deg, ${tier.from}, ${tier.to})`, color: tier.ink }}>
          <div className="font-display text-3xl leading-none font-bold">{card.ovr}</div>
          <div className="text-[10px] font-semibold tracking-widest">{tier.name}</div>
          <div className="mt-0.5 text-[10px] opacity-80">POT {card.pot}</div>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">This season</h3>
        {s ? (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Tile label="GP" value={String(s.gp)} />
              <Tile label="MPG" value={s.mpg.toFixed(1)} />
              <Tile label="PPG" value={s.ppg.toFixed(1)} rank={r('ppg')} />
              <Tile label="RPG" value={s.rpg.toFixed(1)} rank={r('rpg')} />
              <Tile label="APG" value={s.apg.toFixed(1)} rank={r('apg')} />
              <Tile label="SPG" value={s.spg.toFixed(1)} rank={r('spg')} />
              <Tile label="BPG" value={s.bpg.toFixed(1)} rank={r('bpg')} />
              <Tile label="TOPG" value={s.topg.toFixed(1)} />
              <Tile label="FG%" value={fmtPct(s.fgPct)} rank={r('fgPct')} />
              <Tile label="3P%" value={fmtPct(s.tpPct)} rank={r('tpPct')} />
              <Tile label="FT%" value={fmtPct(s.ftPct)} rank={r('ftPct')} />
              <Tile label="ORPG" value={s.orpg.toFixed(1)} />
            </div>
            <p className="mt-1 text-[11px] text-ink-500">League ranks show only for players with enough games and shots to qualify.</p>
          </>
        ) : (
          <p className="text-sm text-ink-500">No games yet this season.</p>
        )}
        {card.prev && (
          <p className="mt-2 text-sm text-ink-300">
            Last season ({card.prev.team}): <span className="font-mono">{card.prev.ppg.toFixed(1)}</span> ppg, <span className="font-mono">{card.prev.rpg.toFixed(1)}</span> rpg, <span className="font-mono">{card.prev.apg.toFixed(1)}</span> apg, {fmtPct(card.prev.fgPct)} FG in {card.prev.gp} games.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Ratings{card.isYou ? '' : ' (compared with yours)'}</h3>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {card.ratings.map((x) => (
            <div key={x.key} className="flex items-center gap-2">
              <div className="flex-1">
                <Meter label={x.label} value={x.value} color={x.value >= 80 ? 'var(--color-gold)' : x.value >= 60 ? 'var(--color-win)' : '#38bdf8'} />
              </div>
              {!card.isYou && <span className={cx('w-8 text-right font-mono text-[11px]', x.vsYou > 0 ? 'text-loss' : x.vsYou < 0 ? 'text-win' : 'text-ink-500')}>{x.vsYou > 0 ? `+${x.vsYou}` : x.vsYou < 0 ? `−${-x.vsYou}` : '='}</span>}
            </div>
          ))}
        </div>
      </section>

      {card.contract && (
        <p className="text-sm text-ink-300">
          Contract: <span className="font-mono text-gold">{money(card.contract.salary)}</span> a year{card.contract.years ? `, ${card.contract.years} year${card.contract.years === 1 ? '' : 's'} left` : ''}.
        </p>
      )}

      {card.career && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Your career</h3>
          <p className="text-sm text-ink-300">
            {card.career.gp} games: <span className="font-mono">{card.career.ppg.toFixed(1)}</span> ppg, <span className="font-mono">{card.career.rpg.toFixed(1)}</span> rpg, <span className="font-mono">{card.career.apg.toFixed(1)}</span> apg, {fmtPct(card.career.fgPct)} FG, {fmtPct(card.career.tpPct)} 3P.
          </p>
          {card.recent.length > 0 && (
            <table className="mt-2 w-full text-xs">
              <tbody>
                {card.recent.map((g, i) => (
                  <tr key={i} className="border-b border-court-800">
                    <td className="py-1 font-mono text-ink-500">W{g.week}</td>
                    <td className={cx('w-8 font-semibold', g.won ? 'text-win' : 'text-loss')}>{g.won ? 'W' : 'L'}</td>
                    <td className="font-mono text-ink-400">{g.score}</td>
                    <td className="text-ink-300">vs {g.opp}</td>
                    <td className="text-right text-ink-400">{g.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

/** Opens from any player's name. Takes the card as a prop so the fade-out never draws from a store that has moved on. */
function Shell({ card, onClose }: { card: AthleteCard; onClose: () => void }) {
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={card.name} className="fixed inset-0 z-[54] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()} className="my-auto w-full max-w-3xl rounded-2xl border border-court-600 bg-court-850 p-5 shadow-2xl">
        <div className="mb-3 flex justify-end">
          <button onClick={onClose} className="rounded-md px-2 py-1 text-ink-400 hover:bg-court-700 hover:text-ink-100" aria-label="Close">
            ✕
          </button>
        </div>
        <Body card={card} />
      </motion.div>
    </motion.div>
  );
}

export function AthleteCardModal() {
  const game = useStore((s) => s.game);
  const id = useStore((s) => s.cardId);
  const close = useStore((s) => s.closeCard);
  const card = game && id ? athleteCard(game, id) : null;
  return <AnimatePresence>{card ? <Shell key={card.id} card={card} onClose={close} /> : null}</AnimatePresence>;
}

export { STAT_BY_KEY, fmtStat };
