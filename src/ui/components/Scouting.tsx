import { RATING_LABELS, type RatingKey } from '../../state/schemas';
import type { Edge, MomentIntel, PlayerIntel, TeamQuick } from '../../engine/intel';
import { useStore } from '../../state/store';
import { Avatar, Pill, cx } from './ui';

/** Last few shots as dots, oldest first. Filled = made. Always paired with text for screen readers. */
function FormDots({ recent }: { recent: boolean[] }) {
  if (!recent.length) return <span className="text-[11px] text-ink-500">no shots yet</span>;
  const made = recent.filter(Boolean).length;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Made ${made} of last ${recent.length} shots`}>
      {recent.map((m, i) => (
        <span key={i} className={cx('inline-block h-2 w-2 rounded-full border', m ? 'border-win bg-win' : 'border-ink-500 bg-transparent')} />
      ))}
    </span>
  );
}

function HeatPill({ heat }: { heat: PlayerIntel['heat'] }) {
  if (heat === 'hot') return <Pill color="#f97316">🔥 hot hand</Pill>;
  if (heat === 'cold') return <Pill color="#38bdf8">🧊 cold</Pill>;
  return null;
}

/** "Your SHO 74 vs His DEF 81  −7" with the gap spelled out, so it reads without color. */
export function EdgeLine({ edge }: { edge: Edge }) {
  const gap = edge.you - edge.them;
  const label = gap >= 5 ? 'advantage' : gap <= -5 ? 'disadvantage' : 'even';
  return (
    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink-400">
      <span>
        {edge.yours} <b className="text-ink-100">{edge.you}</b>
      </span>
      <span className="text-ink-500">vs</span>
      <span>
        {edge.theirs} <b className="text-ink-100">{edge.them}</b>
      </span>
      <span className={cx('ml-auto rounded px-1.5 py-0.5 font-sans font-semibold', gap >= 5 ? 'bg-win/15 text-win' : gap <= -5 ? 'bg-loss/15 text-loss' : 'bg-court-700 text-ink-300')}>
        {gap > 0 ? '+' : gap < 0 ? '−' : ''}
        {Math.abs(gap)} {label}
      </span>
    </div>
  );
}

const COMPARE: RatingKey[] = ['shooting', 'finishing', 'handles', 'passing', 'defense', 'athleticism'];

function colorsFor(game: ReturnType<typeof useStore.getState>['game'], id: string): [string, string] | undefined {
  const a = game?.athletes[id];
  return a?.teamId ? game?.teams[a.teamId]?.colors : undefined;
}

function Matchup({ you, m, kind }: { you: PlayerIntel; m: PlayerIntel; kind: 'offense' | 'defense' }) {
  const game = useStore((s) => s.game);
  const l = m.line;
  return (
    <section aria-label="Your matchup">
      <h4 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">{kind === 'offense' ? 'Guarding you' : 'Coming at you'}</h4>
      <div className="flex items-start gap-3">
        <Avatar name={m.name} size={52} colors={colorsFor(game, m.id)} mood={m.heat === 'hot' ? 'happy' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{m.name}</span>
            <span className="font-mono text-xs text-ink-400">
              {m.position} · OVR <b className="text-ink-100">{m.ovr}</b>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <HeatPill heat={m.heat} />
            {m.tags.map((t) => (
              <Pill key={t} color={t === 'Foul trouble' ? '#ef4444' : undefined}>
                {t}
              </Pill>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-ink-300">
            <span>
              {l.pts} pts · {l.fgm}-{l.fga} FG · {l.reb} reb · {l.ast} ast · {l.pf} pf
            </span>
            <FormDots recent={m.recent} />
          </div>
        </div>
      </div>
      <table className="mt-3 w-full text-xs">
        <thead className="text-[10px] tracking-wider text-ink-500 uppercase">
          <tr className="border-b border-court-700">
            <th className="py-1 text-left font-semibold" />
            <th className="w-12 text-right font-semibold" title="Your ratings tonight, including your energy and morale">
              You
            </th>
            <th className="w-12 text-right font-semibold">Him</th>
            <th className="w-16 text-right font-semibold">Edge</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {COMPARE.map((k) => {
            const a = you.ratings[k];
            const b = m.ratings[k];
            const d = a - b;
            return (
              <tr key={k} className="border-b border-court-800">
                <td className="py-1 font-sans text-ink-300">{RATING_LABELS[k]}</td>
                <td className={cx('text-right', d > 0 && 'font-bold text-ink-100')}>{a}</td>
                <td className={cx('text-right', d < 0 && 'font-bold text-ink-100')}>{b}</td>
                <td className={cx('text-right', d >= 5 ? 'text-win' : d <= -5 ? 'text-loss' : 'text-ink-500')}>
                  {d > 0 ? '+' : d < 0 ? '−' : ''}
                  {Math.abs(d)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-ink-500">Ratings are as of tonight: your energy and morale raise or lower them, so they can differ a little from your profile.</p>
    </section>
  );
}

function Floor({ title, players, you }: { title: string; players: PlayerIntel[]; you?: PlayerIntel }) {
  const all = you ? [you, ...players] : players;
  const bestD = [...all].sort((a, b) => b.ratings.defense - a.ratings.defense)[0];
  return (
    <div>
      <h5 className="mb-1 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">{title}</h5>
      <ul className="space-y-1">
        {all.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className="w-6 font-mono text-[10px] text-ink-500">{p.position}</span>
            <span className={cx('min-w-0 flex-1 truncate', you && p.id === you.id && 'font-semibold text-hoop-400')}>{p.short}</span>
            {p.heat === 'hot' && (
              <span title="Hot hand" aria-label="Hot hand">
                🔥
              </span>
            )}
            {p.heat === 'cold' && (
              <span title="Cold" aria-label="Cold">
                🧊
              </span>
            )}
            {p.id === bestD.id && p.ratings.defense >= 60 && (
              <span title={`Best defender on the floor (DEF ${p.ratings.defense})`} aria-label="Best defender on the floor">
                🛡️
              </span>
            )}
            <span className="w-8 text-right font-mono text-[11px] text-ink-300" title="Points tonight">
              {p.line.pts}p
            </span>
            <span className="w-7 text-right font-mono text-[11px] text-ink-500" title="Overall rating">
              {p.ovr}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pct(m: number, a: number) {
  return a ? `${Math.round((m / a) * 100)}%` : '—';
}

function TeamRow({ label, us, them, better }: { label: string; us: string; them: string; better: 'us' | 'them' | 'none' }) {
  return (
    <tr className="border-b border-court-800">
      <td className={cx('py-1 text-right', better === 'us' && 'font-bold text-ink-100')}>{us}</td>
      <td className="px-3 text-center font-sans text-[10px] tracking-wider text-ink-500 uppercase">{label}</td>
      <td className={cx('py-1 text-left', better === 'them' && 'font-bold text-ink-100')}>{them}</td>
    </tr>
  );
}

function TeamStats({ us, them }: { us: TeamQuick; them: TeamQuick }) {
  const cmp = (a: number, b: number, higherIsBetter = true): 'us' | 'them' | 'none' => (a === b ? 'none' : (a > b) === higherIsBetter ? 'us' : 'them');
  const pc = (t: TeamQuick) => (t.fga ? t.fgm / t.fga : 0);
  const p3 = (t: TeamQuick) => (t.tpa ? t.tpm / t.tpa : 0);
  return (
    <section aria-label="Team numbers so far">
      <h4 className="mb-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Game so far</h4>
      <table className="mx-auto font-mono text-xs">
        <thead>
          <tr className="text-[11px]">
            <th className="text-right font-semibold text-hoop-400">{us.abbrev}</th>
            <th />
            <th className="text-left font-semibold text-ink-300">{them.abbrev}</th>
          </tr>
        </thead>
        <tbody>
          <TeamRow label="Points" us={String(us.pts)} them={String(them.pts)} better={cmp(us.pts, them.pts)} />
          <TeamRow label="FG" us={pct(us.fgm, us.fga)} them={pct(them.fgm, them.fga)} better={cmp(pc(us), pc(them))} />
          <TeamRow label="3PT" us={`${us.tpm}-${us.tpa}`} them={`${them.tpm}-${them.tpa}`} better={cmp(p3(us), p3(them))} />
          <TeamRow label="Reb" us={String(us.reb)} them={String(them.reb)} better={cmp(us.reb, them.reb)} />
          <TeamRow label="Ast" us={String(us.ast)} them={String(them.ast)} better={cmp(us.ast, them.ast)} />
          <TeamRow label="TO" us={String(us.tov)} them={String(them.tov)} better={cmp(us.tov, them.tov, false)} />
        </tbody>
      </table>
    </section>
  );
}

/** Everything useful to know before choosing: who you face, who is hot, who defends, and the game so far. */
export function ScoutingReport({ intel, kind }: { intel: MomentIntel; kind: 'offense' | 'defense' }) {
  return (
    <div className="space-y-4 text-sm">
      {intel.tips.length > 0 && (
        <section aria-label="Scouting tips">
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">What to know</h4>
          <ul className="space-y-1.5 text-[13px] leading-snug text-ink-100">
            {intel.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-hoop-400">▸</span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Matchup you={intel.you} m={intel.matchup} kind={kind} />
      <section aria-label="Players on the floor">
        <h4 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">On the floor</h4>
        <div className="grid grid-cols-2 gap-4">
          <Floor title="Your team" players={intel.teammates} you={intel.you} />
          <Floor title="Their team" players={intel.opponents} />
        </div>
        <p className="mt-2 text-[10px] text-ink-500">🔥 hot hand · 🧊 cold · 🛡️ best defender · points tonight · overall</p>
      </section>
      <TeamStats us={intel.teams.us} them={intel.teams.them} />
    </div>
  );
}
