import { useState } from 'react';
import { PHILOSOPHIES, canStartCoaching, coachRoster, coachingSummary, nextSeason, playSeason, setPhilosophy, startCoaching, stopCoaching, takeJob, type SeasonReport } from '../../engine/coaching';
import { MAX_TRADES, checkTrade, proposeTrade, tradeTargets } from '../../engine/coachingTrades';
import { salaryCap } from '../../engine/contracts';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Button, Meter, Panel, Pill, cx } from '../components/ui';

const RESULT_TEXT = { champion: 'Champions', finalist: 'Lost in the final', playoffs: 'Made the playoffs', missed: 'Missed the playoffs' } as const;

/** On the retired screen: an offer to keep going from the sideline. */
export function CoachCard() {
  const game = useStore((s) => s.game)!;
  const edit = useStore((s) => s.editGame);
  const toast = useStore((s) => s.toast);
  if (!canStartCoaching(game)) return null;
  return (
    <Panel title="Coach">
      <p className="text-sm text-ink-300">Teams want a name like yours on the sideline. Take over a pro team and see how far you can take it. This does not end your family story: you can hang up the whistle and start the next generation any time.</p>
      <Button
        className="mt-3"
        onClick={() => {
          if (edit((d) => startCoaching(d))) toast('The phone is ringing. Pick a job.', 'award');
        }}
      >
        Become a coach
      </Button>
    </Panel>
  );
}

function History() {
  const game = useStore((s) => s.game)!;
  const h = game.coaching.history;
  if (!h.length) return null;
  const sum = coachingSummary(game);
  return (
    <Panel title="Coaching record" right={<span className="font-mono text-sm text-gold">{sum.score} pts</span>}>
      <p className="mb-2 text-xs text-ink-400">
        {sum.seasons} season{sum.seasons === 1 ? '' : 's'} · {sum.w}-{sum.l} · {sum.titles} title{sum.titles === 1 ? '' : 's'} · {sum.playoffs} playoff trip{sum.playoffs === 1 ? '' : 's'} · {sum.jobs} job{sum.jobs === 1 ? '' : 's'}
      </p>
      <ul className="space-y-1 text-sm">
        {[...h].reverse().map((x) => (
          <li key={x.season} className="flex items-baseline gap-3">
            <span className="w-12 font-mono text-xs text-ink-500">S{x.season}</span>
            <span className="min-w-0 flex-1 truncate">{x.teamName}</span>
            <span className="font-mono">
              {x.w}-{x.l}
            </span>
            <span className={cx('hidden w-40 text-right text-xs sm:inline', x.result === 'champion' ? 'text-gold' : 'text-ink-400')}>{x.fired ? 'Let go' : RESULT_TEXT[x.result]}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Roster() {
  const game = useStore((s) => s.game)!;
  const rows = coachRoster(game);
  return (
    <Panel title="Your roster">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-ink-500">
          <tr>
            <th className="py-1">Player</th>
            <th>Pos</th>
            <th>Age</th>
            <th className="text-right">OVR</th>
            <th className="text-right">Pot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-court-700">
              <td className="py-1">{r.name}</td>
              <td className="text-ink-400">{r.position}</td>
              <td className="text-ink-400">{r.age}</td>
              <td className="text-right font-mono">{r.ovr}</td>
              <td className="text-right font-mono text-ink-400">{r.potential}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

/** Swap players with another team under the same salary cap every team lives under. */
function TradeMarket() {
  const game = useStore((s) => s.game)!;
  const edit = useStore((s) => s.editGame);
  const toast = useStore((s) => s.toast);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const targets = tradeTargets(game, 8);
  const mine = coachRoster(game);
  const chk = targetId && give.length ? checkTrade(game, targetId, give) : null;
  const left = MAX_TRADES - game.coaching.trades;
  const toggle = (id: string) => setGive((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length >= 2 ? g : [...g, id]));
  return (
    <Panel title="Trade market" right={<span className="text-xs text-ink-500">{left} trade{left === 1 ? '' : 's'} left · cap {money(salaryCap(game))}</span>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Who you want</div>
          <ul className="space-y-1">
            {targets.map((t) => (
              <li key={t.id}>
                <button onClick={() => setTargetId(t.id)} aria-pressed={targetId === t.id} className={cx('flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm', targetId === t.id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-700 hover:border-court-500')}>
                  <span className="min-w-0 flex-1 truncate">
                    {t.name} <span className="text-xs text-ink-500">{t.position} · {t.age} · {t.team}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-400">{money(t.salary)}</span>
                  <span className="w-7 text-right font-mono">{t.ovr}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500">What you give (one or two)</div>
          <ul className="space-y-1">
            {mine.map((p) => (
              <li key={p.id}>
                <button onClick={() => toggle(p.id)} aria-pressed={give.includes(p.id)} className={cx('flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm', give.includes(p.id) ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-700 hover:border-court-500')}>
                  <span className="min-w-0 flex-1 truncate">
                    {p.name} <span className="text-xs text-ink-500">{p.position} · {p.age}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-400">{money(p.salary)}</span>
                  <span className="w-7 text-right font-mono">{p.ovr}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-court-700 bg-court-900/40 p-3 text-sm">
        {chk ? (
          <>
            <p className={chk.ok ? 'font-semibold text-win' : 'text-ink-300'}>{chk.reasons.join(' ')}</p>
            <p className="mt-1 text-xs text-ink-500">
              Your payroll after: {money(chk.yourPayroll)} · theirs: {money(chk.theirPayroll)} · value ratio {chk.ratio.toFixed(2)}
            </p>
          </>
        ) : (
          <p className="text-ink-500">Pick a player you want and one or two of yours to offer.</p>
        )}
        <Button
          className="mt-3"
          disabled={!chk?.ok}
          onClick={() => {
            const r = edit((d) => proposeTrade(d, targetId!, give));
            toast(r.text, r.done ? 'award' : 'bad');
            if (r.done) {
              setTargetId(null);
              setGive([]);
            }
          }}
        >
          Propose the trade
        </Button>
      </div>
    </Panel>
  );
}

/** The coaching loop: pick a job, set the philosophy, play the season, read the result. */
export function CoachingPanel() {
  const game = useStore((s) => s.game)!;
  const edit = useStore((s) => s.editGame);
  const [report, setReport] = useState<SeasonReport | null>(null);
  const c = game.coaching;
  const team = c.teamId ? game.teams[c.teamId] : null;
  const last = c.history[c.history.length - 1];

  return (
    <div className="space-y-4">
      <Panel
        title="Head coach"
        right={
          <Button variant="ghost" onClick={() => confirm('Hang up the whistle? Your coaching record stays, and you go back to your retired career.') && edit((d) => stopCoaching(d))}>
            Hang up the whistle
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="font-display text-2xl font-bold">{team ? team.name : 'Between jobs'}</div>
            <div className="text-xs text-ink-400">Season {game.career.season}</div>
          </div>
          <div className="min-w-[200px] flex-1">
            <Meter label="Reputation" value={c.rep} color={c.rep < 25 ? 'var(--color-loss)' : 'var(--color-gold)'} />
          </div>
        </div>
      </Panel>

      {c.stage === 'offers' && (
        <Panel title="Job offers">
          <p className="mb-3 text-sm text-ink-300">{c.history.length ? 'The board has moved on. These teams want to talk.' : 'Your name opens doors. Better reputations get better rooms.'}</p>
          <ul className="space-y-2">
            {c.offers.map((id) => {
              const t = game.teams[id];
              return (
                <li key={id} className="flex items-center gap-3 rounded-lg border border-court-700 bg-court-900/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-semibold">{t.name}</div>
                    <div className="text-xs text-ink-400">Prestige {t.prestige} · {t.prestige >= 70 ? 'Contender: they expect to win' : t.prestige >= 45 ? 'Middle of the pack' : 'A rebuild: patience, for now'}</div>
                  </div>
                  <Button onClick={() => edit((d) => takeJob(d, id))}>Take the job</Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {c.stage === 'offseason' && (
        <>
          <Panel title="Philosophy">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PHILOSOPHIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => edit((d) => setPhilosophy(d, p.id))}
                  aria-pressed={c.philosophy === p.id}
                  className={cx('rounded-lg border p-3 text-left transition-colors', c.philosophy === p.id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}
                >
                  <div className="font-display font-semibold">{p.label}</div>
                  <div className="text-xs text-ink-400">{p.blurb}</div>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-500">Staff drills this skill with the whole roster</div>
              <div className="flex flex-wrap gap-2">
                {RATING_KEYS.map((k: RatingKey) => (
                  <button
                    key={k}
                    onClick={() => edit((d) => setPhilosophy(d, d.coaching.philosophy, k))}
                    aria-pressed={c.focus === k}
                    className={cx('rounded-md border px-3 py-1 text-xs', c.focus === k ? 'border-hoop-500 text-hoop-400' : 'border-court-600 text-ink-400')}
                  >
                    {RATING_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <Button className="mt-4" onClick={() => setReport(edit((d) => playSeason(d)))}>
              Play the season
            </Button>
          </Panel>
          <TradeMarket />
          <Roster />
        </>
      )}

      {c.stage === 'review' && last && (
        <Panel title="Season in review">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl font-bold">
              {last.w}-{last.l}
            </span>
            <Pill color={last.result === 'champion' ? '#fbbf24' : undefined}>{RESULT_TEXT[last.result]}</Pill>
            {last.fired && <Pill color="#ef4444">Let go</Pill>}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-ink-300">
            {(report?.messages ?? [`${last.teamName} finish ${last.w}-${last.l}.`]).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
            {report?.champion && (
              <li className="text-ink-400">
                Champion: {report.champion}. MVP: {report.mvp || 'n/a'}.
              </li>
            )}
          </ul>
          <Button
            className="mt-4"
            onClick={() => {
              setReport(null);
              edit((d) => nextSeason(d));
            }}
          >
            {last.fired ? 'See who calls' : 'On to next season'}
          </Button>
        </Panel>
      )}

      <History />
    </div>
  );
}
