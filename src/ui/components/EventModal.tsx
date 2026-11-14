import { AnimatePresence, motion } from 'framer-motion';
import { LEVEL_CONFIG } from '../../data/teams';
import { STYLE_INFO, availableEvents, type ContestState, type Entrant, type Style } from '../../engine/events';
import { useStore } from '../../state/store';
import { Button, Pill, cx } from './ui';

const STYLES: Style[] = ['safe', 'balanced', 'risky'];

function Shell({ title, icon, onClose, children }: { title: string; icon: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="my-auto w-full max-w-2xl rounded-2xl border border-court-600 bg-court-850 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-court-700 px-5 py-3">
          <span className="text-2xl">{icon}</span>
          <h2 className="flex-1 font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-ink-400 hover:bg-court-700 hover:text-ink-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

const total = (e: Entrant) => e.rounds.reduce((a, b) => a + b, 0);

function Scoreboard({ c, upTo }: { c: ContestState; upTo: number }) {
  const rows = [...c.entrants].sort((a, b) => (c.finished || upTo >= 2 ? total(b) - total(a) : (b.rounds[0] ?? 0) - (a.rounds[0] ?? 0)));
  const unit = c.eventId === 'skills_three' ? 'pts' : 'score';
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] tracking-wider text-ink-500 uppercase">
        <tr className="border-b border-court-700 text-right">
          <th className="py-1.5 text-left font-semibold">Entrant</th>
          <th className="font-semibold">Skill</th>
          <th className="font-semibold">Round 1</th>
          {c.round >= 2 && <th className="font-semibold">Finals</th>}
          <th className="font-semibold">Total</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((e) => (
          <tr key={e.id} className={cx('border-b border-court-800 text-right', e.isUser && 'text-hoop-400', !e.alive && c.round >= 2 && 'opacity-50')}>
            <td className="py-1.5 text-left font-sans">
              {e.name}
              {e.isUser && <span className="ml-1.5 text-[10px] uppercase">you</span>}
            </td>
            <td className="text-ink-500">{e.rating}</td>
            <td>
              {e.rounds[0] ?? '·'}
              {e.style && e.rounds[0] !== undefined && <span className="ml-1 font-sans text-[10px] text-ink-500">{e.style === 'risky' ? 'big' : e.style === 'safe' ? 'safe' : 'mid'}</span>}
            </td>
            {c.round >= 2 && <td>{e.alive ? (e.rounds[1] ?? '·') : '–'}</td>}
            <td className="font-semibold">
              {total(e)} <span className="text-[10px] font-normal text-ink-500">{unit}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContestFlow() {
  const game = useStore((s) => s.game)!;
  const c = useStore((s) => s.contest)!;
  const play = useStore((s) => s.playContest);
  const finish = useStore((s) => s.finishContest);
  const close = useStore((s) => s.closeEvent);
  const mean = LEVEL_CONFIG[game.league.level].ratingMean;
  const me = c.entrants.find((e) => e.isUser)!;
  const field = c.entrants.filter((e) => !e.isUser);
  const fieldAvg = Math.round(field.reduce((a, e) => a + e.rating, 0) / field.length);
  const title = c.eventId === 'skills_three' ? 'Three-Point Contest' : 'Slam Dunk Contest';
  const rated = c.eventId === 'skills_three' ? 'shooting' : 'athleticism and finishing';
  const advice = me.rating >= mean + 12 ? `Your ${rated} is well above the level average, so you can afford to go big.` : me.rating >= mean ? `Your ${rated} is solid. A middle approach is usually right.` : `Your ${rated} is below average here. The steady approach protects you.`;
  const waiting = !c.finished && me.rounds.length < c.round;
  const style = STYLE_INFO[c.eventId];

  return (
    <Shell title={title} icon={c.eventId === 'skills_three' ? '🎯' : '🚀'} onClose={close}>
      <div className="space-y-5">
        {c.entrants[0].rounds.length > 0 && <Scoreboard c={c} upTo={c.round} />}
        {c.notes.map((n, i) => (
          <p key={i} className="text-sm text-ink-300">
            {n}
          </p>
        ))}

        {waiting && (
          <section>
            <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">{c.round === 1 ? 'Round 1: everyone goes, top three advance' : 'The finals'}</h3>
            <p className="mb-3 text-xs text-ink-400">
              You are rated {me.rating} (the rest of the field averages {fieldAvg}). {advice}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {STYLES.map((s) => (
                <button key={s} onClick={() => play(s)} className="rounded-lg border border-court-600 bg-court-800/50 p-3 text-left transition-colors hover:border-hoop-500">
                  <div className="font-semibold">{style[s].name}</div>
                  <div className="mt-1 text-xs text-ink-400">{style[s].blurb}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {c.finished && (
          <section className="rounded-xl border border-court-600 bg-court-800/40 p-4 text-center">
            <div className="font-display text-4xl font-bold">{c.placement === 1 ? '🏆 Champion' : `#${c.placement}`}</div>
            <p className="mt-1 text-sm text-ink-300">{c.placement === 1 ? 'You won it. The whole league is talking.' : c.placement! <= 3 ? 'A podium finish. People noticed.' : 'Not your night, but you were in the room.'}</p>
            <Button className="mt-4" onClick={finish}>
              Collect and continue
            </Button>
          </section>
        )}
      </div>
    </Shell>
  );
}

function CombineFlow() {
  const res = useStore((s) => s.combine);
  const run = useStore((s) => s.runCombine);
  const done = useStore((s) => s.finishCombine);
  const close = useStore((s) => s.closeEvent);
  return (
    <Shell title="Draft Combine" icon="📋" onClose={close}>
      {!res ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-300">Every front office is in the building. Five stations: a sprint, a vertical, a shooting drill, lane agility, and team interviews. How do you want to approach it?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={() => run('steady')} className="rounded-lg border border-court-600 bg-court-800/50 p-3 text-left hover:border-hoop-500">
              <div className="font-semibold">Steady</div>
              <div className="mt-1 text-xs text-ink-400">Show who you are. Consistent results, no big swings.</div>
            </button>
            <button onClick={() => run('push')} className="rounded-lg border border-court-600 bg-court-800/50 p-3 text-left hover:border-hoop-500">
              <div className="font-semibold">Go all out</div>
              <div className="mt-1 text-xs text-ink-400">Higher ceiling, bigger swings, and about a 6% chance you tweak something and hurt your stock.</div>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-court-800">
            {res.drills.map((d, i) => (
              <motion.li key={d.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.18 }} className="flex items-center gap-3 py-2">
                <span className={cx('w-9 rounded-md py-1 text-center font-display text-sm font-bold', d.grade === 'A+' || d.grade === 'A' ? 'bg-win/20 text-win' : d.grade === 'B' ? 'bg-court-700 text-ink-100' : 'bg-loss/20 text-loss')}>{d.grade}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{d.label}</div>
                  <div className="text-xs text-ink-500">{d.note}</div>
                </div>
              </motion.li>
            ))}
          </ul>
          {res.injured && <p className="text-sm text-loss">You tweaked something pushing too hard, and scouts noticed.</p>}
          <div className="rounded-lg bg-court-800/60 p-3 text-center">
            <div className="text-[10px] font-semibold tracking-widest text-ink-500 uppercase">Draft stock</div>
            <div className={cx('font-display text-3xl font-bold', res.boost >= 0 ? 'text-win' : 'text-loss')}>
              {res.boost > 0 ? '+' : ''}
              {res.boost.toFixed(1)}
            </div>
            <p className="text-sm text-ink-300">{res.summary}</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={done}>Continue →</Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** The open event, if any. Mounted once in the game shell. */
export function EventModal() {
  const eventId = useStore((s) => s.eventId);
  const contest = useStore((s) => s.contest);
  return <AnimatePresence>{eventId === 'combine' ? <CombineFlow key="combine" /> : eventId && contest ? <ContestFlow key={eventId} /> : null}</AnimatePresence>;
}

/** Invitations shown on the hub when an event is available. */
export function EventsCard() {
  const game = useStore((s) => s.game)!;
  const open = useStore((s) => s.openEvent);
  const events = availableEvents(game);
  if (!events.length) return null;
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-3 rounded-xl border border-gold/40 bg-gradient-to-r from-gold/10 to-court-850 p-3">
          <span className="text-2xl">{e.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{e.title}</span>
              <Pill color="#fbbf24">Invitation</Pill>
            </div>
            <div className="text-xs text-ink-400">{e.blurb}</div>
          </div>
          <Button onClick={() => open(e.id)}>Enter</Button>
        </div>
      ))}
    </div>
  );
}
