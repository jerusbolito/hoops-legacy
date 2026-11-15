import { useState } from 'react';
import { LeadersPanel } from '../components/LeadersPanel';
import { PlayerLink } from '../components/PlayerLink';
import { standingsRows } from '../../engine/career';
import { allStarIds, mvpRace } from '../../engine/awards';
import { payroll, salaryCap, salaryOf } from '../../engine/contracts';
import { playoffRoundName, teamRoster } from '../../engine/league';
import { overall } from '../../engine/ratings';
import { fmt1 } from '../../engine/stats';
import { useStore } from '../../state/store';
import { Panel, TeamBadge, cx } from '../components/ui';

export function LeagueView() {
  const game = useStore((s) => s.game)!;
  const [teamId, setTeamId] = useState(game.career.teamId);
  const rows = standingsRows(game);
  const team = game.teams[teamId];
  const roster = teamRoster(game, teamId).sort((a, b) => overall(b.ratings) - overall(a.ratings));


  const playoffGames = game.league.schedule.filter((g) => g.playoffRound);
  const rounds = [...new Set(playoffGames.map((g) => g.playoffRound!))].sort();
  const myGames = game.league.schedule.filter((g) => !g.playoffRound && (g.homeId === game.career.teamId || g.awayId === game.career.teamId));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Around the league" className="lg:col-span-2" right={<span className="text-xs text-ink-500">{game.transactions.length} moves logged</span>}>
        {game.transactions.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody has moved yet. Transfers and trades happen as seasons turn.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[...game.transactions].reverse().slice(0, 10).map((t, i) => (
              <li key={i} className="border-l-2 border-court-600 pl-2 text-ink-300">
                <span className="mr-1.5 font-mono text-[10px] text-ink-500">S{t.season}W{t.week}</span>
                <span className="mr-1.5 text-[10px] font-semibold uppercase text-hoop-400">{t.kind}</span>
                {t.text}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="MVP race" right={<span className="text-xs text-ink-500">{allStarIds(game).length ? 'All-Stars named' : 'Builds as the season goes'}</span>}>
        {(() => {
          const race = mvpRace(game, 6);
          const stars = new Set(allStarIds(game));
          if (race.length === 0) return <p className="text-sm text-ink-500">Too early to tell. Check back after a few games.</p>;
          return (
            <ul className="space-y-1.5 text-sm">
              {race.map((r, i) => (
                <li key={r.id} className={cx('flex items-center justify-between gap-3 rounded-md px-2 py-1', r.isYou && 'bg-hoop-500/10 text-hoop-400')}>
                  <span>
                    <span className="mr-2 font-mono text-ink-500">{i + 1}</span>
                    <PlayerLink id={r.id}>{r.name}</PlayerLink> {r.isYou && <span className="text-[10px] uppercase">you</span>}
                    {r.isRival && <span className="ml-1 text-[10px] text-loss uppercase">rival</span>}
                    {stars.has(r.id) && <span className="ml-1" title="All-Star">⭐</span>}
                    <span className="ml-2 text-xs text-ink-500">{r.team}</span>
                  </span>
                  <span className="font-mono text-xs">{r.ppg} ppg · {r.score}</span>
                </li>
              ))}
            </ul>
          );
        })()}
      </Panel>

      <Panel title={`${game.league.name} standings`}>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500">
            <tr className="border-b border-court-700 text-right">
              <th className="py-1.5 text-left">#</th>
              <th className="text-left">Team</th>
              <th>W</th>
              <th>L</th>
              <th>PF</th>
              <th>PA</th>
              <th>DIFF</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr
                key={r.team.id}
                onClick={() => setTeamId(r.team.id)}
                className={cx('cursor-pointer border-b border-court-800 text-right hover:bg-court-800', r.team.id === game.career.teamId && 'text-hoop-400', r.team.id === teamId && 'bg-court-800')}
              >
                <td className="py-1.5 text-left text-ink-500">{r.rank}</td>
                <td className="text-left font-sans">
                  {r.team.name} {game.league.champion === r.team.id && '🏆'}
                </td>
                <td>{r.w}</td>
                <td>{r.l}</td>
                <td>{r.pf}</td>
                <td>{r.pa}</td>
                <td className={r.pf - r.pa >= 0 ? 'text-win' : 'text-loss'}>{r.pf - r.pa > 0 ? '+' : ''}{r.pf - r.pa}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-500">Top {game.league.playoffTeams} make the playoffs. Click a team to view its roster.</p>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><TeamBadge team={team} size={22} /> {team.name} {team.mascot}</span>} right={<span className="text-xs text-ink-400">Coach {team.coachName}{game.league.level === 'pro' && <> · payroll ${(payroll(game, team) / 1e6).toFixed(0)}M of ${(salaryCap(game) / 1e6).toFixed(0)}M</>}</span>}>
        <table className="w-full text-sm">
          <tbody>
            {roster.map((a) => {
              const s = game.leagueStats[a.id];
              const me = a.id === game.player.athleteId;
              const npc = Object.values(game.npcs).find((n) => n.athleteId === a.id);
              return (
                <tr key={a.id} className={cx('border-b border-court-800', me && 'text-hoop-400')}>
                  <td className="w-8 py-1.5 font-mono text-xs text-ink-500">{a.position}</td>
                  <td>
                    <PlayerLink id={a.id}>
                      {a.firstName} {a.lastName}
                    </PlayerLink>
                    {npc && <span className="ml-1.5 text-[10px] uppercase text-ink-500">{npc.role.replace('_', ' ')}</span>}
                  </td>
                  <td className="text-right font-mono text-xs text-ink-400">{a.age}y</td>
                  {game.league.level === 'pro' && <td className="w-16 text-right font-mono text-xs text-ink-500">${(((me && game.player.contract ? game.player.contract.salary : salaryOf(a)) / 1e6)).toFixed(1)}M</td>}
                  <td className="w-20 text-right font-mono text-xs text-ink-400">{s && s.gp ? `${fmt1(s.pts / s.gp)} ppg` : ''}</td>
                  <td className="w-10 text-right font-mono font-semibold">{overall(a.ratings)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <LeadersPanel />

      <Panel title={rounds.length ? 'Playoff bracket' : 'Your schedule'}>
        {rounds.length ? (
          <div className="flex gap-4 overflow-x-auto scrollbar-thin">
            {rounds.map((r) => (
              <div key={r} className="min-w-[160px] space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{playoffRoundName(game.league, r)}</div>
                {playoffGames
                  .filter((g) => g.playoffRound === r)
                  .map((g) => (
                    <div key={g.id} className="rounded-md border border-court-700 text-xs">
                      {[g.homeId, g.awayId].map((tid, i) => {
                        const sc = i === 0 ? g.homeScore : g.awayScore;
                        const won = g.played && sc === Math.max(g.homeScore!, g.awayScore!);
                        return (
                          <div key={tid} className={cx('flex justify-between px-2 py-1', won && 'font-semibold text-win', tid === game.career.teamId && 'text-hoop-400')}>
                            <span>{game.teams[tid].name}</span>
                            <span className="font-mono">{g.played ? sc : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-1 text-sm">
            {myGames.map((g) => {
              const home = g.homeId === game.career.teamId;
              const opp = game.teams[home ? g.awayId : g.homeId];
              const us = home ? g.homeScore : g.awayScore;
              const them = home ? g.awayScore : g.homeScore;
              return (
                <li key={g.id} className={cx('flex items-center gap-2', g.week === game.career.week && 'text-hoop-400')}>
                  <span className="w-10 font-mono text-xs text-ink-500">W{g.week}</span>
                  <span className="flex-1">
                    {home ? 'vs' : '@'} {opp.name}
                  </span>
                  {g.played && (
                    <span className={cx('font-mono text-xs', us! > them! ? 'text-win' : 'text-loss')}>
                      {us! > them! ? 'W' : 'L'} {us}-{them}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
