import { useState } from 'react';
import type { Issue } from '../../state/schemas';
import { useStore } from '../../state/store';
import { PersonText, PlayerLink } from '../components/PlayerLink';
import { Panel, cx } from '../components/ui';

const KIND: Record<Issue['kind'], { icon: string; label: string }> = {
  preview: { icon: '🔮', label: 'Season preview' },
  weekly: { icon: '📰', label: 'Weekly edition' },
  playoffs: { icon: '🏆', label: 'Playoff edition' },
  recap: { icon: '📚', label: 'Season in review' },
};

function Rule() {
  return <div className="my-2 border-t-[3px] border-double border-[#1c1a17]/70" />;
}

function Paper({ issue }: { issue: Issue }) {
  const left = issue.sections.filter((s) => ['milestones', 'archive', 'performers', 'story', 'around', 'recruiting', 'awards', 'power', 'watch', 'yours', 'stars'].includes(s.id));
  const right = issue.sections.filter((s) => !left.includes(s));
  return (
    <article className="mx-auto max-w-5xl rounded-md border border-[#cfc6b0] bg-[#f4efe4] p-5 font-serif text-[#1c1a17] shadow-xl sm:p-8" aria-label={issue.masthead}>
      <header className="text-center">
        <div className="text-[11px] font-semibold tracking-[0.3em] uppercase">{KIND[issue.kind].label}</div>
        <h2 className="font-serif text-4xl font-black tracking-tight sm:text-5xl">{issue.masthead}</h2>
        <Rule />
        <div className="flex justify-between text-xs uppercase tracking-widest">
          <span>{issue.dateline}</span>
          <span>Vol. {issue.season} · No. {issue.id}</span>
        </div>
        <div className="mt-1 border-t border-[#1c1a17]/60" />
      </header>

      <section className="mt-5 text-center">
        <h3 className="font-serif text-3xl leading-tight font-black sm:text-4xl">{issue.headline}</h3>
        <p className="mx-auto mt-2 max-w-2xl text-base italic text-[#3a362e]">{issue.deck}</p>
      </section>

      <section className="mt-5 gap-8 text-[15px] leading-relaxed sm:columns-2">
        {issue.lead.map((p, i) => (
          <p key={i} className={cx('mb-3 break-inside-avoid', i === 0 && 'first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-5xl first-letter:leading-[0.85] first-letter:font-black')}>
            <PersonText item={p} />
          </p>
        ))}
      </section>

      {issue.scoreboard.length > 0 && (
        <>
          <Rule />
          <h4 className="mb-2 text-center text-xs font-bold tracking-[0.25em] uppercase">Scoreboard</h4>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {issue.scoreboard.map((g, i) => (
              <div key={i} className={cx('border border-[#1c1a17]/40 px-2 py-1.5', g.you && 'bg-[#e9dfc2] font-semibold')}>
                {g.round && <div className="text-[10px] uppercase tracking-widest text-[#6b6455]">{g.round}</div>}
                <div className="flex justify-between">
                  <span className={g.as > g.hs ? 'font-bold' : ''}>{g.away}</span>
                  <span className="font-mono">{g.as}</span>
                </div>
                <div className="flex justify-between">
                  <span className={g.hs > g.as ? 'font-bold' : ''}>{g.home}</span>
                  <span className="font-mono">{g.hs}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Rule />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {left.map((s) => (
            <section key={s.id}>
              <h4 className="border-b border-[#1c1a17]/50 pb-0.5 text-xs font-bold tracking-[0.25em] uppercase">{s.title}</h4>
              <ul className="mt-2 space-y-2 text-[14px] leading-snug">
                {s.items.map((it, i) => (
                  <li key={i}>
                    <PersonText item={it} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-5">
          {issue.standings.length > 0 && (
            <section>
              <h4 className="border-b border-[#1c1a17]/50 pb-0.5 text-xs font-bold tracking-[0.25em] uppercase">Standings</h4>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {issue.standings.map((r, i) => (
                    <tr key={r.team} className={cx('border-b border-[#1c1a17]/15', r.you && 'bg-[#e9dfc2] font-semibold')}>
                      <td className="w-6 py-0.5 font-mono text-xs text-[#6b6455]">{i + 1}</td>
                      <td>{r.team}</td>
                      <td className="text-right font-mono">{r.w}-{r.l}</td>
                      <td className={cx('w-8 text-right text-xs', r.move > 0 ? 'text-green-800' : r.move < 0 ? 'text-red-800' : 'text-[#6b6455]')}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {issue.leaders.length > 0 && (
            <section>
              <h4 className="border-b border-[#1c1a17]/50 pb-0.5 text-xs font-bold tracking-[0.25em] uppercase">League Leaders</h4>
              <div className="mt-2 space-y-3">
                {issue.leaders.map((b) => (
                  <div key={b.label}>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-[#6b6455]">{b.label}</div>
                    {b.rows.map((r, i) => (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span>
                          <span className="mr-1 font-mono text-xs text-[#6b6455]">{i + 1}</span>
                          <PlayerLink id={r.id}>{r.name}</PlayerLink> <span className="text-xs text-[#6b6455]">{r.team}</span>
                        </span>
                        <span className="font-mono">{r.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}
          {right.map((s) => (
            <section key={s.id}>
              <h4 className="border-b border-[#1c1a17]/50 pb-0.5 text-xs font-bold tracking-[0.25em] uppercase">{s.title}</h4>
              <ul className="mt-2 space-y-2 text-[14px] leading-snug">
                {s.items.map((it, i) => (
                  <li key={i}>
                    <PersonText item={it} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>
      </div>
    </article>
  );
}

export function NewspaperView() {
  const game = useStore((s) => s.game)!;
  const issues = game.paper;
  const [pick, setPick] = useState<number | null>(null);
  if (!issues.length) {
    return (
      <Panel title="The paper">
        <p className="text-sm text-ink-400">The first edition comes out when the season starts. After that, a new one lands every week with the scores, the standouts and the stories from around the league.</p>
      </Panel>
    );
  }
  const current = issues.find((i) => i.id === pick) ?? issues[issues.length - 1];
  const archive = [...issues].reverse();
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
      <Paper issue={current} />
      <aside className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Back issues</h3>
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {archive.map((i) => (
            <li key={i.id}>
              <button onClick={() => setPick(i.id)} className={cx('w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors', i.id === current.id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-700 hover:border-court-500')}>
                <div className="flex items-center gap-1.5 font-semibold text-ink-100">
                  <span>{KIND[i.kind].icon}</span>
                  <span className="truncate">{i.kind === 'weekly' ? `Week ${i.week}` : KIND[i.kind].label}</span>
                  <span className="ml-auto font-mono text-[10px] text-ink-500">S{i.season}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-ink-400">{i.headline}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
