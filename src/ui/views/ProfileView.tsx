import { LEVEL_CONFIG, yearLabel } from '../../data/teams';
import { userAthlete, userRole } from '../../engine/career';
import { LABELS } from '../../engine/origin';
import { ARCHETYPE_INFO, RATING_INFO, formatHeight, overall } from '../../engine/ratings';
import { averages, fmt1, fmtPct, lineSummary, seasonRows, totals } from '../../engine/stats';
import { RATING_KEYS, RATING_LABELS } from '../../state/schemas';
import { useStore } from '../../state/store';
import { BadgesPanel } from '../components/BadgesPanel';
import { CareerHighs } from '../components/CareerHighs';
import { CareerTimeline } from '../components/CareerTimeline';
import { FamilyTree } from '../components/Legacy';
import { PlayerCardPanel } from '../components/PlayerCard';
import { RatingsRadar } from '../components/RatingsRadar';
import { Meter, Panel, Pill, Stat, cx } from '../components/ui';

export function ProfileView() {
  const game = useStore((s) => s.game)!;
  const a = userAthlete(game);
  const p = game.player;
  const rows = seasonRows(game.gameLog);
  const career = averages(totals(game.gameLog));
  const recent = [...game.gameLog].reverse().slice(0, 10);
  const lastTraining = useStore((s) => s.lastTraining);
  const deltas = Object.fromEntries((lastTraining?.gains ?? []).map((g) => [g.key, g.delta]));

  return (
    <div className="space-y-5">
    <Panel title="Career timeline">
      <CareerTimeline />
    </Panel>
    <FamilyTree game={game} />
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
      <div className="space-y-5">
        <Panel title="Ratings">
          <div className="flex justify-center">
            <RatingsRadar ratings={a.ratings} size={280} deltas={deltas} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Overall" value={overall(a.ratings)} />
            <Stat label="Potential" value={a.potential} />
            <Stat label="Age" value={a.age} />
          </div>
          <div data-tour="ratings" className="mt-4 space-y-2">
            {RATING_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-8 cursor-help text-[11px] font-semibold text-ink-400" title={`${RATING_INFO[k].name}: ${RATING_INFO[k].what}`}>{RATING_LABELS[k]}</span>
                <Meter className="flex-1" value={a.ratings[k]} max={99} showValue={false} color={a.ratings[k] >= 75 ? 'var(--color-gold)' : 'var(--color-hoop-500)'} />
                <span className="w-6 text-right font-mono text-xs">{a.ratings[k]}</span>
                <span className="w-8 text-right font-mono text-[10px] text-ink-500">{p.progress[k] ? `.${Math.floor(p.progress[k] * 10)}` : ''}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Player card">
          <PlayerCardPanel />
        </Panel>
        <Panel title="Bio">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-400">Position</dt>
            <dd>
              {a.position} · {ARCHETYPE_INFO[a.archetype].label}
            </dd>
            <dt className="text-ink-400">Age</dt>
            <dd>{a.age}</dd>
            <dt className="text-ink-400">Height</dt>
            <dd>{formatHeight(a.heightIn)}</dd>
            <dt className="text-ink-400">Hometown</dt>
            <dd>{p.hometown}</dd>
            {p.origin.chosen && (
              <>
                <dt className="text-ink-400">Family</dt>
                <dd>{LABELS.background[p.origin.background]}</dd>
                <dt className="text-ink-400">Plays to</dt>
                <dd>{p.origin.motive === 'legacy' ? 'Carry the name' : LABELS.motive[p.origin.motive]}</dd>
                <dt className="text-ink-400">Temperament</dt>
                <dd>{LABELS.temperament[p.origin.temperament]}</dd>
                <dt className="text-ink-400">Number</dt>
                <dd>#{p.origin.look.number}</dd>
              </>
            )}
            <dt className="text-ink-400">Level</dt>
            <dd>
              {LEVEL_CONFIG[game.career.level].label}, {yearLabel(game.career.level, game.career.year)}
            </dd>
            <dt className="text-ink-400">Role</dt>
            <dd>{userRole(game).label}</dd>
            {game.career.level !== 'pro' && (
              <>
                <dt className="text-ink-400">GPA</dt>
                <dd className={cx(p.academics < 2.3 && 'text-loss')}>{p.academics.toFixed(2)}</dd>
              </>
            )}
            <dt className="text-ink-400">Followers</dt>
            <dd>{p.followers.toLocaleString()}</dd>
            <dt className="text-ink-400">Bank</dt>
            <dd>${p.money.toLocaleString()}</dd>
            {p.contract && (
              <>
                <dt className="text-ink-400">Contract</dt>
                <dd>
                  ${(p.contract.salary / 1e6).toFixed(1)}M × {p.contract.yearsLeft}y
                </dd>
              </>
            )}
            {p.draftPick !== null && (
              <>
                <dt className="text-ink-400">Drafted</dt>
                <dd>#{p.draftPick}</dd>
              </>
            )}
          </dl>
          {p.traits.length > 0 && (
            <div className="mt-3 flex gap-1.5">
              {p.traits.map((t) => (
                <Pill key={t} color="#f97316">
                  {t.replace('_', ' ')}
                </Pill>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="min-w-0 space-y-5">
        <Panel title="Career stats">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500">
                <tr className="border-b border-court-700 text-right">
                  <th className="py-2 text-left">Season</th>
                  <th className="text-left">Team</th>
                  <th>GP</th>
                  <th>MPG</th>
                  <th>PPG</th>
                  <th>RPG</th>
                  <th>APG</th>
                  <th>SPG</th>
                  <th>BPG</th>
                  <th>FG%</th>
                  <th>3P%</th>
                  <th>FT%</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.season} className="border-b border-court-800 text-right">
                    <td className="py-1.5 text-left font-sans">
                      S{r.season} <span className="text-xs text-ink-500">{LEVEL_CONFIG[r.level].label} {yearLabel(r.level, r.year)}</span>
                    </td>
                    <td className="text-left font-sans text-xs">{game.teams[r.teamId]?.abbrev}</td>
                    <td>{r.avg.gp}</td>
                    <td>{fmt1(r.avg.mpg)}</td>
                    <td className="font-semibold text-ink-100">{fmt1(r.avg.ppg)}</td>
                    <td>{fmt1(r.avg.rpg)}</td>
                    <td>{fmt1(r.avg.apg)}</td>
                    <td>{fmt1(r.avg.spg)}</td>
                    <td>{fmt1(r.avg.bpg)}</td>
                    <td>{fmtPct(r.avg.fgPct)}</td>
                    <td>{fmtPct(r.avg.tpPct)}</td>
                    <td>{fmtPct(r.avg.ftPct)}</td>
                  </tr>
                ))}
                {rows.length > 1 && (
                  <tr className="text-right text-hoop-400">
                    <td className="py-1.5 text-left font-sans font-semibold">Career</td>
                    <td />
                    <td>{career.gp}</td>
                    <td>{fmt1(career.mpg)}</td>
                    <td className="font-semibold">{fmt1(career.ppg)}</td>
                    <td>{fmt1(career.rpg)}</td>
                    <td>{fmt1(career.apg)}</td>
                    <td>{fmt1(career.spg)}</td>
                    <td>{fmt1(career.bpg)}</td>
                    <td>{fmtPct(career.fgPct)}</td>
                    <td>{fmtPct(career.tpPct)}</td>
                    <td>{fmtPct(career.ftPct)}</td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-4 text-center font-sans text-ink-500">
                      No games played yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Career highs">
          <CareerHighs />
        </Panel>

        <Panel title="Game log">
          <ul className="divide-y divide-court-800 text-sm">
            {recent.map((g) => (
              <li key={g.gameId} className="flex items-center gap-3 py-2">
                <span className={cx('w-6 font-display font-bold', g.teamScore > g.oppScore ? 'text-win' : 'text-loss')}>{g.teamScore > g.oppScore ? 'W' : 'L'}</span>
                <span className="w-20 font-mono text-xs">
                  {g.teamScore}-{g.oppScore}
                </span>
                <span className="w-40 truncate text-ink-300">
                  vs {game.teams[g.oppId]?.name}
                  {g.playoff && <span className="ml-1 text-gold">★</span>}
                </span>
                <span className="flex-1 truncate font-mono text-xs text-ink-400">{lineSummary(g.line)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="py-2 text-ink-500">No games yet.</li>}
          </ul>
        </Panel>

        <Panel title="Badges and signature moves">
          <BadgesPanel />
        </Panel>

        <Panel title="Trophy case">
          {p.awards.length ? (
            <div className="flex flex-wrap gap-2">
              {p.awards.map((x, i) => (
                <Pill key={i} color="#fbbf24">
                  🏆 {x.name} · S{x.season}
                </Pill>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500">Empty, for now.</p>
          )}
        </Panel>
      </div>
    </div>
    </div>
  );
}
