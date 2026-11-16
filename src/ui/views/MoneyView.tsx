import { motion } from 'framer-motion';
import { ALLOWANCE_LABEL, hasService, serviceUntil, servicePrice, servicesFor, weeklyPay } from '../../engine/finance';
import { STANCE, capSpace, extensionStatus, holdingOut, payroll, salaryCap, type Stance } from '../../engine/contracts';
import { moveStatus, oddsLabel, tradeDeadlineWeek, tradeOdds } from '../../engine/moves';
import { useStore } from '../../state/store';
import type { FinanceLine } from '../../state/schemas';
import { Button, Panel, Pill, Stat, TeamBadge, cx } from '../components/ui';

const money = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`);

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-court-800 py-1.5 text-sm last:border-0">
      <div>
        <span className="text-ink-300">{label}</span>
        {sub && <span className="ml-2 text-xs text-ink-500">{sub}</span>}
      </div>
      <span className={cx('font-mono', tone === 'pos' && 'text-win', tone === 'neg' && 'text-loss')}>{value}</span>
    </div>
  );
}

function Ledger({ title, line }: { title: string; line: FinanceLine }) {
  const out = line.taxes + line.living + line.services + line.spent;
  const net = line.earned + line.gifts - out;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">{title}</div>
      <Row label="Earned" value={money(line.earned)} tone="pos" />
      {line.gifts > 0 && <Row label="Windfalls and gifts" value={money(line.gifts)} tone="pos" />}
      {line.taxes > 0 && <Row label="Taxes and fees" value={`−${money(line.taxes)}`} tone="neg" />}
      {line.living > 0 && <Row label="Living costs" value={`−${money(line.living)}`} tone="neg" />}
      {line.services > 0 && <Row label="Trainers and staff" value={`−${money(line.services)}`} tone="neg" />}
      {line.spent > 0 && <Row label="Everything else you spent" value={`−${money(line.spent)}`} tone="neg" />}
      <Row label="Kept" value={`${net < 0 ? '−' : ''}${money(Math.abs(net))}`} tone={net >= 0 ? 'pos' : 'neg'} />
    </div>
  );
}

function MovePanel() {
  const game = useStore((s) => s.game)!;
  const live = useStore((s) => !!s.live);
  const start = useStore((s) => s.startMove);
  const pick = useStore((s) => s.pickMove);
  const stay = useStore((s) => s.stayPut);
  const last = useStore((s) => s.lastMove);
  const dismiss = useStore((s) => s.dismissMove);
  const st = moveStatus(game);
  const pm = game.career.pendingMove;
  const team = game.teams[game.career.teamId];

  if (!st && !last) return null;
  return (
    <Panel title={st?.title ?? 'A fresh start'} right={<TeamBadge team={team} size={26} />}>
      {last && (
        <div className="mb-4 rounded-lg border border-win/30 bg-win/5 p-3">
          <div className="text-sm font-semibold text-win">{last.headline}</div>
          {last.story && <p className="mt-2 text-sm text-ink-200">{last.story}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {last.lines.map((l) => (
              <span key={l} className="rounded-md border border-court-600 px-2 py-0.5 text-xs text-ink-300">
                {l}
              </span>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" onClick={dismiss}>
              OK
            </Button>
          </div>
        </div>
      )}

      {pm ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-300">{pm.headline} Pick one, or stay where you are.</p>
          <div className="grid gap-3">
            {pm.offers.map((o, i) => (
              <motion.div key={o.teamId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="rounded-xl border border-court-600 bg-court-800/50 p-3">
                <div className="flex items-center gap-3">
                  <TeamBadge team={o} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base font-semibold">
                      {o.name} {o.mascot}
                    </div>
                    <div className="text-xs text-ink-400">
                      Prestige {o.prestige} · Coach {o.coachName}
                    </div>
                  </div>
                  <div className="text-right">
                    <Pill color={o.rank <= 3 ? '#22c55e' : o.rank <= 5 ? '#38bdf8' : '#94a3b8'}>{o.role}</Pill>
                    {o.nil > 0 && <div className="mt-1 font-mono text-xs text-gold">+{money(o.nil)} signing package</div>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-300">{o.pitch}</p>
                <Button className="mt-2 w-full" onClick={() => pick(o.teamId)}>
                  {pm.kind === 'trade' ? `Agree to the deal with ${o.name}` : `Transfer to ${o.name}`}
                </Button>
              </motion.div>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={stay}>
            {`Stay with ${team.name}`}
          </Button>
          <p className="text-xs text-ink-500">Whoever you leave behind will remember how it went. A new coach starts with little trust in you.</p>
        </div>
      ) : (
        st && (
          <div className="space-y-3">
            <p className="text-sm text-ink-300">{st.blurb}</p>
            {st.kind === 'trade' && st.can && (
              <div className="rounded-lg bg-court-800/60 px-3 py-2 text-xs text-ink-300">
                Odds the front office agrees: <span className="font-semibold text-ink-100">{oddsLabel(tradeOdds(game))}</span>. A bench role, a strained coach, or a push from your agent all help. A star on a long deal is hard to move.
                {game.career.phase === 'regular' && <span className="text-ink-500"> Deadline: week {tradeDeadlineWeek(game)}.</span>}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className={cx('text-xs', st.can ? 'text-ink-400' : 'text-ink-500')}>{st.reason}</span>
              <Button variant={st.kind === 'trade' ? 'outline' : 'primary'} disabled={!st.can || live} onClick={start}>
                {st.title}
              </Button>
            </div>
          </div>
        )
      )}
    </Panel>
  );
}

function ContractPanel() {
  const game = useStore((s) => s.game)!;
  const live = useStore((s) => !!s.live);
  const ask = useStore((s) => s.negotiate);
  const take = useStore((s) => s.acceptCounter);
  const hold = useStore((s) => s.holdOut);
  const back = useStore((s) => s.endHoldOut);
  const k = game.player.contract;
  const st = extensionStatus(game);
  if (!k || !st) return null;
  const team = game.teams[game.career.teamId];
  const out = holdingOut(game);
  const weeks = Number(game.story.flags.holdout_weeks ?? 0);
  const rejected = game.story.flags.ext_season === game.career.season && st.counter === null && !out;
  return (
    <Panel title="Contract talks" right={<span className="text-xs text-ink-500">{k.yearsLeft} year{k.yearsLeft === 1 ? '' : 's'} left</span>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Paid now" value={money(k.salary)} sub="a year" />
        <Stat label="Worth" value={money(st.value)} sub="a year" />
        <Stat label="Team payroll" value={money(payroll(game, team))} sub={`cap ${money(salaryCap(game))}`} />
      </div>
      <p className="mt-3 text-xs text-ink-400">
        Cap room: <span className="font-mono text-ink-200">{money(capSpace(game, team))}</span>. {st.reason}
      </p>
      {out && (
        <div className="mt-3 rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm">
          <div className="font-semibold text-loss">Holding out: week {weeks}</div>
          <p className="mt-1 text-xs text-ink-300">You are not playing. Your coach and teammates are losing patience, and the front office inches up each week.</p>
          <Button variant="ghost" className="mt-2" onClick={back}>
            Go back to work
          </Button>
        </div>
      )}
      {st.counter !== null && (
        <div className="mt-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
          <div className="text-sm">They offer <span className="font-mono text-gold">{money(st.counter)}</span> a year for {st.years} years.</div>
          <Button className="mt-2 w-full" onClick={take}>
            Take the deal
          </Button>
        </div>
      )}
      {st.can && st.counter === null && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(STANCE) as Stance[]).map((s) => (
            <button key={s} disabled={live} onClick={() => ask(s)} className="rounded-lg border border-court-600 bg-court-800/50 p-3 text-left hover:border-hoop-500">
              <div className="text-sm font-semibold">{STANCE[s].label}</div>
              <div className="font-mono text-xs text-gold">{money(Math.round((st.value * STANCE[s].mult) / 100000) * 100000)}</div>
              <div className="mt-1 text-xs text-ink-400">{STANCE[s].blurb}</div>
            </button>
          ))}
        </div>
      )}
      {rejected && game.career.phase === 'regular' && !out && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-court-600 p-3">
          <span className="text-xs text-ink-400">They turned you down. You can sit out until they come around, but it costs you with everyone.</span>
          <Button variant="danger" onClick={hold}>
            Hold out
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function MoneyView() {
  const game = useStore((s) => s.game)!;
  const buy = useStore((s) => s.buyService);
  const p = game.player;
  const lvl = game.career.level;
  const w = weeklyPay(game);
  const f = p.finance;
  const regular = game.career.phase === 'regular';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <Panel title="Your money">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="In the bank" value={money(p.money)} />
            <Stat label="Each game week" value={`${money(w.net)}`} sub="after taxes and costs" />
            {p.contract && <Stat label="Contract" value={`${money(p.contract.salary)}/yr`} sub={`${p.contract.yearsLeft} year${p.contract.yearsLeft === 1 ? '' : 's'} left`} />}
            <Stat label="This season" value={money(f.earned + f.gifts - f.taxes - f.living - f.services - f.spent)} sub="kept so far" />
          </div>
          <p className="mt-4 text-sm text-ink-400">
            {lvl === 'hs' && 'You get an allowance and pick up odd jobs. It is not much, but it covers the things that actually help.'}
            {lvl === 'college' && 'You get a scholarship stipend, and endorsements can add a lot more once your name is worth something.'}
            {lvl === 'pro' && 'Your salary arrives every week of the season. The league takes its share and your life costs a lot to run.'}
          </p>
        </Panel>

        <Panel title="Where a week's pay goes">
          {lvl === 'pro' && <Row label="Salary" value={money(w.salary)} tone="pos" />}
          {lvl !== 'pro' && <Row label={ALLOWANCE_LABEL[lvl]} value={money(w.allowance)} tone="pos" />}
          {w.endorse > 0 && <Row label="Endorsements" value={money(w.endorse)} tone="pos" />}
          {w.taxes > 0 && <Row label="Taxes and agent fees" value={`−${money(w.taxes)}`} tone="neg" />}
          {w.living > 0 && <Row label="Living costs" value={`−${money(w.living)}`} tone="neg" />}
          <Row label="You keep" value={money(w.net)} tone="pos" />
          {!regular && <p className="mt-2 text-xs text-ink-500">Pay only comes in during the regular season.</p>}
        </Panel>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Panel title={`Season ${game.career.season}`}>
            <Ledger title="So far" line={f} />
          </Panel>
          {f.prev && (
            <Panel title="Last season">
              <Ledger title="Final" line={f.prev} />
            </Panel>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <Panel title="Spend it on your game">
          <ul className="space-y-3">
            {servicesFor(game).map((s) => {
              const price = servicePrice(game, s.id);
              const owned = p.services.find((x) => x.id === s.id);
              const active = hasService(game, s.id);
              const covered = !!owned && owned.until >= serviceUntil(game);
              const can = p.money >= price;
              return (
                <li key={s.id} className={cx('rounded-lg border p-3', active ? 'border-win/40 bg-win/5' : 'border-court-700 bg-court-800/40')}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{s.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.name}</span>
                        {active && <Pill color="#22c55e">Working through S{owned!.until}</Pill>}
                      </div>
                      <div className="text-xs text-ink-400">{s.blurb}</div>
                      <div className="mt-1 text-xs text-ink-300">{s.effect}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-gold">{money(price)}</span>
                    <Button variant={covered ? 'ghost' : 'outline'} disabled={covered || !can} onClick={() => buy(s.id)}>
                      {covered ? 'Hired' : active ? 'Renew for next season' : can ? 'Hire' : 'Cannot afford'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-500">Each one works through the end of the season you hire them in (summer included), or through next season if you hire them in the offseason.</p>
        </Panel>

        {lvl === 'pro' && <ContractPanel />}
        <MovePanel />
      </div>
    </div>
  );
}

