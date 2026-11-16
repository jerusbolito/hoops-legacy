import { CATEGORY_LABEL, dealsAllowed, nameValue } from '../../engine/media';
import { useStore } from '../../state/store';
import { Avatar, Button, Pill, Panel, Stat, cx } from '../components/ui';

const money = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`);

const KIND_LABEL: Record<string, { label: string; color?: string }> = {
  media: { label: 'Media', color: '#38bdf8' },
  fans: { label: 'Fans' },
  haters: { label: 'Critic', color: '#ef4444' },
  rival: { label: 'Rival', color: '#f97316' },
  family: { label: 'Family', color: '#22c55e' },
  brand: { label: 'Brand', color: '#fbbf24' },
};

export function MediaView() {
  const game = useStore((s) => s.game)!;
  const take = useStore((s) => s.takeOffer);
  const pass = useStore((s) => s.turnDownOffer);
  const p = game.player;
  const feed = [...game.feed].reverse();
  const allowed = dealsAllowed(game);
  const dealIncome = p.deals.reduce((a, d) => a + d.perSeason * (1 - d.commission), 0);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      <Panel title="Your feed" right={<span className="text-xs text-ink-400">{p.followers.toLocaleString()} followers</span>}>
        {feed.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing yet. Play some games and people will start talking.</p>
        ) : (
          <ul className="divide-y divide-court-800">
            {feed.map((post) => {
              const k = KIND_LABEL[post.kind] ?? { label: post.kind };
              return (
                <li key={post.id} className="flex gap-3 py-3">
                  <Avatar name={post.author} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-semibold">{post.author}</span>
                      <span className="text-ink-500">{post.handle}</span>
                      <Pill color={k.color}>{k.label}</Pill>
                      <span className="ml-auto font-mono text-[10px] text-ink-500">
                        S{post.season}W{post.week}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[15px] leading-snug text-ink-100">{post.text}</p>
                    <div className="mt-1 text-xs text-ink-500">♥ {post.likes.toLocaleString()}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="space-y-5">
        <Panel title="Money">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="In the bank" value={money(p.money)} />
            <Stat label="Your name is worth" value={allowed ? `${money(nameValue(game))}/yr` : '—'} sub={allowed ? undefined : 'No endorsements in high school'} />
            {p.contract && <Stat label="Salary" value={`${money(p.contract.salary)}/yr`} sub={`${p.contract.yearsLeft} years left`} />}
            {allowed && <Stat label="Deals pay" value={`${money(dealIncome)}/yr`} sub={`${p.deals.length} active`} />}
          </div>
        </Panel>

        <Panel title="Offers" right={<span className="text-xs text-ink-500">{game.offers.length} waiting</span>}>
          {!allowed ? (
            <p className="text-sm text-ink-400">High school players cannot sign endorsement deals. Build your name now and the offers come in college.</p>
          ) : game.offers.length === 0 ? (
            <p className="text-sm text-ink-500">No offers right now. More followers and a better reputation bring more of them.</p>
          ) : (
            <ul className="space-y-3">
              {game.offers.map((o) => (
                <li key={o.id} className="rounded-lg border border-court-700 bg-court-800/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{o.brand}</div>
                      <div className="text-xs text-ink-400">{CATEGORY_LABEL[o.category] ?? o.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-hoop-400">{money(o.perSeason)}/yr</div>
                      <div className="text-xs text-ink-500">
                        {o.years} season{o.years > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {o.sketchy ? <Pill color="#ef4444">Questionable reputation</Pill> : <Pill color="#22c55e">Established</Pill>}
                    {o.energy > 0 && <Pill>−{o.energy} energy/wk</Pill>}
                    {o.commission > 0 && <Pill>{Math.round(o.commission * 100)}% to your agent</Pill>}
                  </div>
                  <p className="mt-2 text-xs text-ink-300">{o.pitch}</p>
                  <p className="mt-1 text-xs text-ink-400 italic">{o.advice}</p>
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1" onClick={() => take(o.id)}>
                      Sign
                    </Button>
                    <Button className="flex-1" variant="outline" onClick={() => pass(o.id)}>
                      Pass
                    </Button>
                  </div>
                  <div className="mt-1.5 text-[10px] text-ink-500">Offer expires in week {o.expiresWeek}.</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Your deals">
          {p.deals.length === 0 ? (
            <p className="text-sm text-ink-500">No deals signed.</p>
          ) : (
            <ul className="space-y-2">
              {p.deals.map((d) => (
                <li key={d.id} className={cx('flex items-center justify-between rounded-lg border p-2.5 text-sm', d.sketchy ? 'border-loss/30' : 'border-court-700')}>
                  <div>
                    <div className="font-semibold">{d.brand}</div>
                    <div className="text-xs text-ink-500">
                      {CATEGORY_LABEL[d.category] ?? d.category} · {d.yearsLeft} season{d.yearsLeft > 1 ? 's' : ''} left{d.sketchy ? ' · risky' : ''}
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm">
                    {money(d.perSeason * (1 - d.commission))}
                    <div className="text-[10px] text-ink-500">after fees</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
