import { MAX_POINTS, RECRUIT_ACTIONS, perksPrice, recruitingOpen, roleRisk, targetAthlete } from '../../engine/recruiting';
import { overall } from '../../engine/ratings';
import { useStore } from '../../state/store';
import { PlayerLink } from '../components/PlayerLink';
import { Meter, Panel, Pill, TeamBadge, cx } from '../components/ui';

const money = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`);

const RISK: Record<string, { label: string; color: string; note: string } | undefined> = {
  threat: { label: 'Could take your minutes', color: '#ef4444', note: 'They are better than you at your own spot. Landing them makes your team stronger and your role harder.' },
  upgrade: { label: 'Big upgrade for the team', color: '#22c55e', note: 'A clearly better player. Your team gets noticeably stronger.' },
};

function Points({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-1" title="Recruiting actions. You get one more each week.">
      {Array.from({ length: MAX_POINTS }, (_, i) => (
        <span key={i} className={cx('h-2.5 w-2.5 rounded-full border', i < n ? 'border-hoop-400 bg-hoop-500' : 'border-court-600')} />
      ))}
    </span>
  );
}

export function RecruitingView() {
  const game = useStore((s) => s.game)!;
  const act = useStore((s) => s.recruit);
  const r = game.recruiting;
  const level = game.career.level;
  const open = recruitingOpen(game);
  const price = perksPrice(game);
  const buzz = [...game.transactions].filter((t) => t.kind === 'recruit').reverse().slice(0, 8);
  const suitors = [...r.suitors].sort((a, b) => b.interest - a.interest);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Panel title={level === 'pro' ? 'Free agents you want' : 'Players you want'} right={<Points n={r.points} />}>
          <p className="mb-3 text-sm text-ink-400">
            {level === 'pro'
              ? 'These players\' deals run out this season. Work on them, and when the market opens they choose between you, other teams and staying.'
              : 'You can help build this team. Work on a player, and at the end of the season they choose between you, the other teams after them, and staying put.'}
          </p>
          {r.targets.length === 0 ? (
            <p className="text-sm text-ink-500">{game.career.year >= 4 && level !== 'pro' ? 'This is your last year here, so there is nobody to recruit for.' : 'Nobody is on your board yet. New names arrive each season.'}</p>
          ) : (
            <ul className="space-y-4">
              {r.targets.map((t) => {
                const a = targetAthlete(game, t);
                if (!a) return null;
                const risk = RISK[roleRisk(game, t)];
                return (
                  <li key={t.athleteId} className="rounded-xl border border-court-700 bg-court-800/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-lg font-semibold">
                          <PlayerLink id={t.athleteId}>{t.name}</PlayerLink>
                        </div>
                        <div className="text-xs text-ink-400">
                          {t.position} · age {a.age} · {t.fromTeam} · OVR <span className="font-mono text-hoop-400">{overall(a.ratings)}</span>
                        </div>
                        <div className="mt-1 text-sm text-ink-300">{t.note}</div>
                      </div>
                      {risk && <Pill color={risk.color}>{risk.label}</Pill>}
                    </div>
                    {risk && <p className="mt-1 text-xs text-ink-500">{risk.note}</p>}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Meter label="Sold on you" value={t.pull} color="var(--color-win)" />
                      <div className="space-y-1.5">
                        {t.rivals.map((rv) => (
                          <div key={rv.teamId} className="flex items-center gap-2 text-xs">
                            <TeamBadge team={game.teams[rv.teamId]} size={20} />
                            <span className="w-28 shrink-0 truncate text-ink-300">{game.teams[rv.teamId].name}</span>
                            <Meter className="flex-1" value={rv.pull} color="#ef4444" showValue={false} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {RECRUIT_ACTIONS.map((x) => {
                        const blocked = !open || r.points < 1 || (x.id === 'perks' && game.player.money < price) || (x.id === 'hype' && game.player.followers < 100) || (x.id === 'visit' && game.player.energy < 12);
                        return (
                          <button key={x.id} disabled={blocked} title={x.blurb} onClick={() => act(t.athleteId, x.id)} className={cx('rounded-lg border border-court-600 bg-court-850 px-2 py-2 text-left text-xs transition-colors', blocked ? 'cursor-not-allowed opacity-40' : 'hover:border-hoop-500')}>
                            <div className="font-semibold text-ink-100">{x.label}</div>
                            {x.id === 'perks' && <div className="font-mono text-gold">{money(price)}</div>}
                            {x.id === 'visit' && <div className="text-ink-500">−8 energy</div>}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {r.points < 1 && r.targets.length > 0 && <p className="mt-3 text-xs text-ink-500">Out of actions. You get another at the start of each week.</p>}
        </Panel>

        {r.history.length > 0 && (
          <Panel title="How it went">
            <ul className="space-y-2 text-sm">
              {[...r.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Pill color={h.outcome === 'signed' ? '#22c55e' : h.outcome === 'lost' ? '#ef4444' : '#94a3b8'}>{h.outcome === 'signed' ? 'Landed' : h.outcome === 'lost' ? 'Lost' : 'Stayed'}</Pill>
                  <span className="text-ink-300">
                    <span className="mr-1 font-mono text-[10px] text-ink-500">S{h.season}</span>
                    {h.text}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="space-y-5">
        <Panel title="Who is recruiting you">
          {level === 'pro' ? (
            <p className="text-sm text-ink-400">Professional teams do not recruit you now. They make offers when your deal is up. Your agent handles that.</p>
          ) : level === 'hs' && game.career.year < 2 ? (
            <p className="text-sm text-ink-400">College programs start watching in your sophomore year. Play well and stay out of trouble.</p>
          ) : suitors.length === 0 ? (
            <p className="text-sm text-ink-500">Nobody is on the phone yet. A strong season and a growing name change that.</p>
          ) : (
            <ul className="space-y-3">
              {suitors.map((s) => (
                <li key={s.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
                      {s.visited && <Pill color="#22c55e">Visited</Pill>}
                      {s.contacts > 0 && `${s.contacts} call${s.contacts > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <Meter value={s.interest} color={s.interest >= 60 ? 'var(--color-win)' : s.interest >= 35 ? '#38bdf8' : '#94a3b8'} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-500">
            {level === 'hs' ? 'The more a school likes you, the better its offer when recruiting opens. Calls and visits come up as moments during the season.' : level === 'college' ? 'Other programs are watching. If you ever open the transfer portal, these are the ones that answer.' : ''}
          </p>
        </Panel>

        <Panel title="Around the league">
          {buzz.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing yet. Stars get courted all year.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {buzz.map((b, i) => (
                <li key={i} className="border-l-2 border-court-600 pl-2 text-ink-300">
                  <span className="mr-1.5 font-mono text-[10px] text-ink-500">S{b.season}W{b.week}</span>
                  {b.text}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
