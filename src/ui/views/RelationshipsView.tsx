import { useState } from 'react';
import { PlayerLink } from '../components/PlayerLink';
import { overall } from '../../engine/ratings';
import { athleteStatus, statusText } from '../../engine/storyAthletes';
import type { Npc } from '../../state/schemas';
import { useStore } from '../../state/store';
import { npcLook } from '../components/looks';
import { Avatar, Meter, Panel, Pill, SignedMeter, cx } from '../components/ui';

const ROLE_COLOR: Record<string, string> = {
  rival: '#ef4444',
  friend: '#22c55e',
  love_interest: '#ec4899',
  family: '#a78bfa',
  coach: '#38bdf8',
  teammate: '#f97316',
  agent: '#fbbf24',
  media: '#94a3b8',
  scout: '#14b8a6',
  mentor: '#60a5fa',
  other: '#94a3b8',
};

function status(n: Npc): string {
  const r = n.relationship;
  if (r.romance >= 60) return 'Partner';
  if (r.romance >= 30) return 'Something there';
  if (r.rivalry >= 70) return 'Bitter rival';
  if (r.rivalry >= 40) return 'Rival';
  if (r.affinity >= 60 && r.trust >= 60) return 'Ride or die';
  if (r.affinity >= 35) return 'Close';
  if (r.affinity <= -40) return 'Enemy';
  if (r.affinity <= -15) return 'Tension';
  return 'Neutral';
}

export function RelationshipsView() {
  const game = useStore((s) => s.game)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const npcs = Object.values(game.npcs)
    .filter((n) => showInactive || n.active)
    .sort((a, b) => Math.abs(b.relationship.affinity) + b.relationship.rivalry + b.relationship.romance - (Math.abs(a.relationship.affinity) + a.relationship.rivalry + a.relationship.romance));
  const sel = selected ? game.npcs[selected] : npcs[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Panel
        title="Your people"
        right={
          <label className="flex items-center gap-1.5 text-xs text-ink-400">
            <input type="checkbox" className="accent-hoop-500" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> show past
          </label>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {npcs.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelected(n.id)}
              className={cx('flex items-center gap-3 rounded-lg border p-3 text-left transition-colors', sel?.id === n.id ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-700 hover:border-court-500', !n.active && 'opacity-50')}
            >
              <Avatar name={n.name} size={46} ring={ROLE_COLOR[n.role]} {...npcLook(game, n)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{n.name}</span>
                </div>
                <div className="truncate text-xs text-ink-400">{n.title}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Pill color={ROLE_COLOR[n.role]}>{n.role.replace('_', ' ')}</Pill>
                  <span className="text-[11px] text-ink-300">{status(n)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Panel>
      {sel && (
        <Panel title={sel.name}>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={sel.name} size={72} ring={ROLE_COLOR[sel.role]} {...npcLook(game, sel)} />
            <div>
              <div className="text-sm text-ink-300">{sel.title}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {sel.personality.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
            </div>
          </div>
          {sel.athleteId && game.athletes[sel.athleteId] && (
            <div className="mb-4 rounded-md bg-court-800 px-3 py-2 text-xs text-ink-300">
              Plays {game.athletes[sel.athleteId].position} for {game.athletes[sel.athleteId].teamId ? game.teams[game.athletes[sel.athleteId].teamId!].name : '—'} · OVR{' '}
              <span className="font-mono text-hoop-400">{overall(game.athletes[sel.athleteId].ratings)}</span>
              {(() => {
                const st = athleteStatus(game, sel);
                return st ? <div className="mt-1 text-ink-400">{statusText(st)}</div> : null;
              })()}
              <div className="mt-1">
                <PlayerLink id={sel.athleteId} className="text-hoop-400">
                  View player card →
                </PlayerLink>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <SignedMeter label="Affinity" value={sel.relationship.affinity} />
            <Meter label="Respect" value={sel.relationship.respect} color="#38bdf8" />
            <Meter label="Trust" value={sel.relationship.trust} color="#a78bfa" />
            <Meter label="Rivalry" value={sel.relationship.rivalry} color="#ef4444" />
            {(sel.role === 'love_interest' || sel.relationship.romance > 0) && <Meter label="Romance" value={sel.relationship.romance} color="#ec4899" />}
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">What they remember</div>
            {sel.memories.length ? (
              <ul className="space-y-1.5 text-sm text-ink-300">
                {[...sel.memories].reverse().map((m, i) => (
                  <li key={i} className="border-l-2 border-court-600 pl-2">
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nothing yet.</p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
