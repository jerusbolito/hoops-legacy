import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextOpponent, userAthlete, userRole, userTeam } from '../../engine/career';
import { Jersey } from '../components/Jersey';
import { lookFor } from '../components/Portrait';
import { formatClock, type KeyMoment, type MomentResult } from '../../engine/gameSim';
import { currentRun } from '../../engine/highlights';
import { calloutFor, lineScore, userStreak, type Callout } from '../../engine/liveStats';
import { usePrefs } from '../../state/prefs';
import { buzz, sfx } from '../sfx';
import { RATING_LABELS } from '../../state/schemas';
import { useStore } from '../../state/store';
import { BoxScoreTable } from '../components/BoxScoreTable';
import { Court } from '../components/Court';
import { Typewriter } from '../components/Typewriter';
import { SceneBanner } from '../components/SceneBanner';
import { Button, EffectChips, Panel, Pill, Spinner, TeamBadge, cx } from '../components/ui';

export function PreGamePanel() {
  const game = useStore((s) => s.game)!;
  const startGame = useStore((s) => s.startGame);
  const next = nextOpponent(game);
  const team = userTeam(game);
  const me = userAthlete(game);
  if (!next) return null;
  const home = next.home ? team : next.opp;
  const away = next.home ? next.opp : team;
  const injured = !!game.player.injury;
  return (
    <Panel title={game.career.phase === 'playoffs' ? 'Playoff game' : 'Game day'}>
      <SceneBanner kind="game" colors={team.colors} className="-mx-4 -mt-4 mb-2" height={130} />
      <div className="flex items-center justify-center gap-6 py-4 sm:gap-12">
        {[away, home].map((t, i) => (
          <div key={t.id} className="flex flex-col items-center gap-2">
            {t.id === team.id ? <Jersey colors={t.colors} number={lookFor(`${me.firstName} ${me.lastName}`).number} name={me.lastName} size={84} /> : <TeamBadge team={t} size={72} />}
            <div className="text-center font-display text-lg font-semibold">{t.name}</div>
            <div className="font-mono text-sm text-ink-400">
              {game.league.standings[t.id].w}-{game.league.standings[t.id].l}
            </div>
            {i === 0 && <span className="sr-only">at</span>}
          </div>
        ))}
      </div>
      <div className="mb-4 text-center text-sm text-ink-400">
        {injured ? 'You are out injured. You will watch from the bench.' : `Your role: ${userRole(game).label}. Energy ${game.player.energy}, morale ${game.player.morale}.`}
      </div>
      <div className="flex justify-center">
        <Button className="pulse-ring px-8 py-3 text-base" onClick={startGame}>
          🏀 Tip off
        </Button>
      </div>
    </Panel>
  );
}

const SPEEDS = [
  { label: '1×', ms: 260, iters: 1 },
  { label: '3×', ms: 90, iters: 2 },
  { label: '⏩', ms: 30, iters: 8 },
];

export function GamePanel() {
  const live = useStore((s) => s.live);
  const post = useStore((s) => s.post);
  if (post) return <PostGame />;
  if (!live) return null;
  return <LiveGame />;
}

function ScorePop({ score, side }: { score: number; side: 'left' | 'right' }) {
  const prev = useRef(score);
  const [pop, setPop] = useState<{ n: number; key: number } | null>(null);
  useEffect(() => {
    if (score > prev.current) setPop({ n: score - prev.current, key: score });
    prev.current = score;
  }, [score]);
  return (
    <AnimatePresence>
      {pop && (
        <motion.span
          key={pop.key}
          initial={{ opacity: 1, y: 0, scale: 1.3 }}
          animate={{ opacity: 0, y: -24, scale: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          onAnimationComplete={() => setPop(null)}
          className={cx('pointer-events-none absolute top-0 font-mono text-xl font-bold text-hoop-400', side === 'left' ? 'left-full ml-2' : 'right-full mr-2')}
        >
          +{pop.n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function ClutchBanner() {
  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-1/2 z-40 -translate-y-1/2 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        className="bg-gradient-to-r from-transparent via-gold/90 to-transparent py-4 text-center font-display text-6xl font-bold tracking-[0.35em] text-court-950 uppercase"
      >
        Clutch time
      </motion.div>
    </motion.div>
  );
}

function LiveGame() {
  const live = useStore((s) => s.live)!;
  const game = useStore((s) => s.game)!;
  const bump = useStore((s) => s.bumpLive);
  const completeGame = useStore((s) => s.completeGame);
  const [speed, setSpeed] = useState(1);
  const [moment, setMoment] = useState<KeyMoment | null>(null);
  const [result, setResult] = useState<MomentResult | null>(null);
  const [final, setFinal] = useState(false);
  const [intro, setIntro] = useState(false);
  const [callout, setCallout] = useState<(Callout & { key: number }) | null>(null);
  const reduce = useReducedMotion();
  const flashy = usePrefs((p) => p.flashy);
  const feedRef = useRef<HTMLDivElement>(null);
  const seenEvents = useRef(0);
  const sim = live.sim;

  // sounds and callouts for whatever just happened. At fast speeds only the last event of a tick is voiced.
  useEffect(() => {
    const fresh = sim.feed.slice(seenEvents.current);
    seenEvents.current = sim.feed.length;
    if (!fresh.length) return;
    const lastShot = [...fresh].reverse().find((e) => e.shot);
    if (lastShot?.shot) {
      if (lastShot.shot.made) sfx.swish();
      else sfx.rim();
      if (lastShot.shot.user && lastShot.shot.made) {
        sfx.cheer(0.7);
        buzz(15);
      }
    }
    if (speed < 2 && flashy) {
      const c = [...fresh].reverse().map(calloutFor).find(Boolean);
      if (c) {
        setCallout({ ...c, key: sim.feed.length });
        sfx.cheer(1.2);
        buzz([20, 40, 20]);
        const t = setTimeout(() => setCallout(null), 1300);
        return () => clearTimeout(t);
      }
    }
  }, [live.tick, sim, speed, flashy]);

  useEffect(() => {
    if (moment?.clutch && !reduce && flashy) {
      setIntro(true);
      const t = setTimeout(() => setIntro(false), 1400);
      return () => clearTimeout(t);
    }
    setIntro(false);
  }, [moment, reduce, flashy]);

  const tick = useCallback(() => {
    if (moment || result || final) return;
    const st = sim.advance(SPEEDS[speed].iters);
    if (st.type === 'moment') setMoment(st.moment);
    if (st.type === 'final') {
      setFinal(true);
      sfx.buzzer();
      buzz([60, 40, 60]);
    }
    bump();
  }, [sim, speed, moment, result, final, bump]);

  useEffect(() => {
    const t = setInterval(tick, SPEEDS[speed].ms);
    return () => clearInterval(t);
  }, [tick, speed]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [live.tick]);

  const skip = () => {
    const st = sim.advance();
    if (st.type === 'moment') setMoment(st.moment);
    if (st.type === 'final') {
      setFinal(true);
      sfx.buzzer();
    }
    bump();
  };

  const pick = (id: string) => {
    const r = sim.resolveMoment(id);
    sfx.click();
    setMoment(null);
    setResult(r);
    bump();
  };

  useEffect(() => {
    if (moment) sfx.whoosh();
  }, [moment]);

  const home = game.teams[sim.sides.home.input.teamId];
  const away = game.teams[sim.sides.away.input.teamId];
  const sc = sim.liveScore();
  const userTeamColor = userTeam(game).colors[0];
  const ul = sim.userLine();
  const run = currentRun(sim.feed);
  const homeCol = home.colors[0];
  const awayCol = away.colors[0];
  const streak = userStreak(sim.feed);
  const ls = lineScore(sim.feed);

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <motion.div animate={intro ? { x: [0, -8, 8, -6, 6, -3, 0] } : { x: 0 }} transition={{ duration: 0.5 }} className="hardwood overflow-hidden rounded-xl border border-court-700 bg-court-950">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-4">
          {[away, home].map((t, i) => (
            <div key={t.id} className={cx('flex items-center gap-3', i === 1 && 'order-3 flex-row-reverse text-right')}>
              <TeamBadge team={t} size={48} />
              <div>
                <div className="font-display text-sm text-ink-400">{t.name}</div>
                <div className="relative w-fit">
                  <motion.div key={i === 0 ? sc.away : sc.home} initial={{ scale: 1.25, color: '#fb923c' }} animate={{ scale: 1, color: '#eef2f8' }} className="font-mono text-4xl font-semibold">
                    {i === 0 ? sc.away : sc.home}
                  </motion.div>
                  <ScorePop score={i === 0 ? sc.away : sc.home} side={i === 0 ? 'left' : 'right'} />
                </div>
              </div>
            </div>
          ))}
          <div className="order-2 rounded-lg border border-court-700 bg-black/50 px-4 py-2 text-center">
            <div className="font-display text-xs tracking-widest text-hoop-400">{sim.final ? 'FINAL' : sc.quarter > 4 ? `OT${sc.quarter - 4}` : `Q${sc.quarter}`}</div>
            <div className="font-mono text-2xl text-amber-300">{formatClock(sc.clock)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-court-800 px-4 py-2 text-xs">
          <span className="font-mono text-ink-300">
            {ul ? `YOU: ${ul.pts} PTS · ${ul.orb + ul.drb} REB · ${ul.ast} AST · ${ul.fgm}-${ul.fga} FG · ${Math.round(ul.sec / 60)} MIN` : 'You are not playing.'}
            {sim.userOnCourt() ? <span className="ml-2 text-win">● on court</span> : <span className="ml-2 text-ink-500">● bench</span>}
            {streak === 'hot' && <span className="ml-2 rounded-full bg-hoop-500/20 px-2 py-0.5 font-sans font-semibold text-hoop-400">🔥 heating up: 3 straight makes</span>}
            {streak === 'cold' && <span className="ml-2 rounded-full bg-sky-500/20 px-2 py-0.5 font-sans font-semibold text-sky-400">🧊 cold: 4 straight misses</span>}
          </span>
          <div className="flex gap-1">
            {SPEEDS.map((s, i) => (
              <button key={i} onClick={() => setSpeed(i)} className={cx('rounded px-2 py-0.5', i === speed ? 'bg-hoop-500 text-white' : 'text-ink-400 hover:bg-court-700')}>
                {s.label}
              </button>
            ))}
            <button onClick={skip} className="rounded px-2 py-0.5 text-ink-400 hover:bg-court-700" disabled={!!moment || final}>
              Skip to next moment
            </button>
          </div>
        </div>
        <div className="px-4 pt-2 pb-3">
          <div className="mb-1 flex h-4 items-center justify-center text-[10px] font-semibold tracking-[0.25em] text-ink-500 uppercase">
            <AnimatePresence mode="wait">
              {run.side && run.pts >= 7 ? (
                <motion.span key={`${run.side}${run.pts}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full px-2 py-0.5 text-white" style={{ background: run.side === 'home' ? homeCol : awayCol }}>
                  🔥 {game.teams[sim.sides[run.side].input.teamId].abbrev} {run.pts}-0 run
                </motion.span>
              ) : (
                <motion.span key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  momentum
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="relative h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${awayCol}, #1c2536 50%, ${homeCol})` }}>
            <motion.div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-court-950 shadow" initial={false} animate={{ left: `${(0.5 + run.momentum / 2) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} />
          </div>
          {ls.quarters.length > 0 && (
            <table className="mx-auto mt-3 font-mono text-[11px] text-ink-300" aria-label="Score by quarter">
              <thead className="text-ink-500">
                <tr>
                  <th className="pr-3 text-left font-normal" />
                  {ls.quarters.map((q) => (
                    <th key={q} className="w-8 text-right font-normal">
                      {q > 4 ? `OT${q - 4}` : `Q${q}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [away.abbrev, ls.away, awayCol],
                  [home.abbrev, ls.home, homeCol],
                ].map(([ab, pts, col]) => (
                  <tr key={ab as string}>
                    <td className="pr-3 font-sans font-semibold" style={{ color: col as string }}>
                      {ab as string}
                    </td>
                    {(pts as number[]).map((p, i) => (
                      <td key={i} className="text-right">
                        {p}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div ref={feedRef} className="h-[300px] overflow-y-auto rounded-xl border border-court-700 bg-court-850/80 p-3 font-mono text-xs scrollbar-thin">
          {sim.feed.slice(-120).map((e, i) => (
            <div key={i} className={cx('flex gap-2 py-0.5', e.user ? 'text-hoop-400' : e.scoring ? 'text-ink-100' : 'text-ink-400', /End of|Final|overtime/.test(e.text) && 'my-1 border-y border-court-700 py-1 text-center text-ink-300')}>
              <span className="w-14 shrink-0 text-ink-500">
                Q{e.quarter > 4 ? 'OT' : e.quarter} {formatClock(e.clock)}
              </span>
              <span className="flex-1">{e.text}</span>
              {e.scoring && (
                <span className="text-ink-500">
                  {e.away}-{e.home}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="relative">
          <Court events={sim.feed} color={userTeamColor} animate={speed < 2} />
          <AnimatePresence>
            {callout && (
              <motion.div
                key={callout.key}
                initial={{ opacity: 0, scale: 0.4, rotate: -6 }}
                animate={{ opacity: 1, scale: 1, rotate: -3 }}
                exit={{ opacity: 0, scale: 1.3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                className={cx('pointer-events-none absolute inset-0 flex items-center justify-center font-display text-4xl font-black tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]', callout.tone === 'gold' ? 'text-gold' : callout.tone === 'good' ? 'text-win' : 'text-loss')}
                aria-live="polite"
              >
                {callout.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{intro && <ClutchBanner />}</AnimatePresence>
      <AnimatePresence>{moment && !intro && <MomentCard moment={moment} onPick={pick} />}</AnimatePresence>
      <AnimatePresence>{result && <ResultCard result={result} onContinue={() => setResult(null)} />}</AnimatePresence>

      {final && !moment && !result && (
        <div className="flex justify-center">
          <Button className="px-8 py-3 text-base" onClick={completeGame}>
            Final buzzer: go to postgame →
          </Button>
        </div>
      )}
    </div>
  );
}

function MomentCard({ moment, onPick }: { moment: KeyMoment; onPick: (id: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className={cx('w-full max-w-xl rounded-2xl border bg-court-850 p-5 shadow-2xl', moment.clutch ? 'border-gold/60 shadow-gold/10' : 'border-hoop-500/50')}>
        <div className="mb-1 flex items-center gap-2">
          <Pill color={moment.clutch ? '#fbbf24' : '#f97316'}>{moment.clutch ? 'Clutch moment' : 'Key moment'}</Pill>
          {moment.isRival && <Pill color="#ef4444">Rival</Pill>}
          <Pill>{moment.kind}</Pill>
        </div>
        <p className="my-3 text-[15px] leading-relaxed">{moment.situation}</p>
        <div className="grid gap-2">
          {moment.options.map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="group rounded-lg border border-court-600 bg-court-800/60 p-3 text-left transition-all hover:border-hoop-500 hover:bg-court-800">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{o.label}</span>
                <span className="font-mono text-sm text-hoop-400">{Math.round(o.odds * 100)}%</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {o.detail} <span className="text-ink-500">· {RATING_LABELS[o.rating]}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-court-700">
                <div className="h-full rounded-full bg-gradient-to-r from-hoop-600 to-hoop-400" style={{ width: `${o.odds * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ResultCard({ result, onContinue }: { result: MomentResult; onContinue: () => void }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true);
      if (result.success) {
        sfx.chime();
        sfx.cheer(1);
        buzz([30, 30, 30]);
      } else {
        sfx.thud();
        buzz(80);
      }
    }, 1100);
    return () => clearTimeout(t);
  }, [result.success]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-court-600 bg-court-850 p-6 text-center shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-400">{result.optionLabel}</div>
        <div className="relative mx-auto my-5 h-3 w-full overflow-hidden rounded-full bg-court-700">
          <div className="absolute inset-y-0 left-0 bg-win/40" style={{ width: `${result.odds * 100}%` }} />
          <motion.div
            className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded bg-white shadow"
            initial={{ left: '0%' }}
            animate={{ left: ['0%', '100%', '20%', `${result.roll * 100}%`] }}
            transition={{ duration: 1, times: [0, 0.35, 0.7, 1], ease: 'easeInOut' }}
          />
        </div>
        <div className="font-mono text-xs text-ink-500">
          roll {Math.round(result.roll * 100)} vs {Math.round(result.odds * 100)} needed
        </div>
        <AnimatePresence>
          {revealed && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
              <div className={cx('mt-4 font-display text-4xl font-bold', result.success ? 'text-win' : 'text-loss')}>{result.success ? 'YES!' : 'NO…'}</div>
              <p className="mt-2 text-ink-300">{result.text}</p>
              <Button className="mt-5" onClick={onContinue}>
                Play on
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function PostGame() {
  const post = useStore((s) => s.post)!;
  const game = useStore((s) => s.game)!;
  const dismiss = useStore((s) => s.dismissPostGame);
  const box = game.lastBox?.box;
  const { report, recap } = post;
  const isHome = box?.home.teamId === game.career.teamId;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <div className={cx('font-display text-5xl font-bold', report.won ? 'text-win' : 'text-loss')}>{report.won ? 'W' : 'L'}</div>
          <div>
            <div className="font-mono text-2xl">
              {report.teamScore} – {report.oppScore}
            </div>
            <div className="text-sm text-ink-400">
              vs {game.teams[report.oppId].name} {report.roundName && <Pill color="#fbbf24">{report.roundName}</Pill>}
            </div>
          </div>
          {report.moments.length > 0 && (
            <div className="ml-auto flex gap-1">
              {report.moments.map((m, i) => (
                <span key={i} title={`${m.optionLabel}: ${m.text}`} className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', m.success ? 'bg-win/20 text-win' : 'bg-loss/20 text-loss', m.clutch && 'ring-1 ring-gold')}>
                  {m.success ? '✓' : '✗'}
                </span>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel title={recap ? recap.headline : 'Postgame'} right={recap?.source === 'template' ? <Pill color="#f59e0b">template</Pill> : null}>
        {recap ? (
          <>
            <Typewriter text={recap.narration} className="text-[15px] leading-relaxed" />
            <div className="mt-4">
              <EffectChips items={recap.applied} />
            </div>
          </>
        ) : (
          <Spinner label="The reporters are writing it up…" />
        )}
      </Panel>
      {post.highlight && (
        <Panel title="Play of the game" right={<Pill color="#fbbf24">{post.highlight.tag}</Pill>}>
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_230px]">
            <div>
              <div className="font-mono text-xs text-ink-400">
                {post.highlight.quarter > 4 ? `OT${post.highlight.quarter - 4}` : `Q${post.highlight.quarter}`} {formatClock(post.highlight.clock)} · {post.highlight.away}-{post.highlight.home}
              </div>
              <div className="mt-1 font-display text-2xl leading-snug font-semibold text-ink-100">{post.highlight.text}</div>
            </div>
            {post.highlight.event.shot && <Court events={[post.highlight.event]} color={userTeam(game).colors[0]} />}
          </div>
        </Panel>
      )}
      {box && (
        <Panel title="Box score">
          <div className="space-y-6">
            <BoxScoreTable state={game} box={isHome ? box.home : box.away} />
            <BoxScoreTable state={game} box={isHome ? box.away : box.home} />
          </div>
        </Panel>
      )}
      <div className="flex justify-end">
        <Button onClick={dismiss} disabled={!recap}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
