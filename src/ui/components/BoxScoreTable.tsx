import { shortName } from '../../engine/ratings';
import { PlayerLink } from './PlayerLink';
import type { GameState, TeamBox } from '../../state/schemas';
import { TeamBadge, cx } from './ui';

export function BoxScoreTable({ state, box }: { state: GameState; box: TeamBox }) {
  const team = state.teams[box.teamId];
  const rows = [...box.players].sort((a, b) => b.sec - a.sec);
  const tot = rows.reduce(
    (t, l) => ({ pts: t.pts + l.pts, reb: t.reb + l.orb + l.drb, ast: t.ast + l.ast, stl: t.stl + l.stl, blk: t.blk + l.blk, tov: t.tov + l.tov, fgm: t.fgm + l.fgm, fga: t.fga + l.fga, tpm: t.tpm + l.tpm, tpa: t.tpa + l.tpa, ftm: t.ftm + l.ftm, fta: t.fta + l.fta }),
    { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
  );
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <TeamBadge team={team} size={26} />
        <span className="font-display font-semibold">{team.name}</span>
        <span className="ml-auto font-mono text-lg">{box.score}</span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500">
            <tr className="border-b border-court-700">
              {['Player', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', '3P', 'FT'].map((h) => (
                <th key={h} className={cx('py-1.5 font-semibold', h === 'Player' ? 'text-left' : 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((l) => {
              const a = state.athletes[l.athleteId];
              const me = l.athleteId === state.player.athleteId;
              return (
                <tr key={l.athleteId} className={cx('border-b border-court-800', me && 'bg-hoop-500/10 text-hoop-400', l.sec === 0 && 'text-ink-500')}>
                  <td className="py-1 font-sans">{a ? <PlayerLink id={a.id}>{shortName(a)}</PlayerLink> : '—'}{a ? <span className="ml-1 text-[10px] text-ink-500">{a.position}</span> : null}</td>
                  <td className="text-right">{l.sec ? Math.round(l.sec / 60) : 'DNP'}</td>
                  <td className="text-right font-semibold">{l.pts}</td>
                  <td className="text-right">{l.orb + l.drb}</td>
                  <td className="text-right">{l.ast}</td>
                  <td className="text-right">{l.stl}</td>
                  <td className="text-right">{l.blk}</td>
                  <td className="text-right">{l.tov}</td>
                  <td className="text-right">{l.fgm}-{l.fga}</td>
                  <td className="text-right">{l.tpm}-{l.tpa}</td>
                  <td className="text-right">{l.ftm}-{l.fta}</td>
                </tr>
              );
            })}
            <tr className="text-ink-300">
              <td className="py-1 font-sans font-semibold">Team</td>
              <td />
              <td className="text-right font-semibold">{tot.pts}</td>
              <td className="text-right">{tot.reb}</td>
              <td className="text-right">{tot.ast}</td>
              <td className="text-right">{tot.stl}</td>
              <td className="text-right">{tot.blk}</td>
              <td className="text-right">{tot.tov}</td>
              <td className="text-right">{tot.fgm}-{tot.fga}</td>
              <td className="text-right">{tot.tpm}-{tot.tpa}</td>
              <td className="text-right">{tot.ftm}-{tot.fta}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
