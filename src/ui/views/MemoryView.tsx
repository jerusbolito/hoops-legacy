import { useMemo, useState } from 'react';
import { MEMORY_WINDOWS, contextSections, fullContext, pinnedMemories } from '../../narrative/context';
import type { Npc } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Panel, Pill, cx } from '../components/ui';

const approxTokens = (text: string) => Math.ceil(text.length / 4);

const SEGMENT_COLORS = ['#f97316', '#38bdf8', '#fbbf24', '#22c55e', '#a78bfa', '#f472b6', '#2dd4bf', '#94a3b8', '#fb7185', '#84cc16'];

export function MemoryView() {
  const game = useStore((s) => s.game)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  const sections = useMemo(() => contextSections(game, []), [game]);
  const total = sections.reduce((a, s) => a + approxTokens(s.text), 0);
  const npcs = Object.values(game.npcs);
  const active = npcs.filter((n) => n.active);
  const st = game.story;
  const log = [...st.log].reverse();
  const sel = selected ? game.npcs[selected] : undefined;
  const totalMemories = npcs.reduce((a, n) => a + n.memories.length, 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullContext(game, []));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; the text is visible to select by hand */
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="What the narrator is told"
        right={
          <span className="font-mono text-xs text-ink-400">
            ≈ {total.toLocaleString()} tokens per AI call
          </span>
        }
      >
        <p className="mb-3 text-sm text-ink-300">
          Every time the AI writes a scene, it gets this and nothing else. It does not remember anything between calls. If it is not on this page, the narrator does not know it.
        </p>
        <div className="flex h-5 overflow-hidden rounded-md bg-court-700" role="img" aria-label="Share of the narrator's context by section">
          {sections.map((s, i) => (
            <div key={s.id} title={`${s.label}: ≈${approxTokens(s.text)} tokens`} style={{ width: `${(approxTokens(s.text) / total) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {sections.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 text-ink-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
              <span className="truncate">{s.label}</span>
              <span className="ml-auto font-mono text-ink-500">{approxTokens(s.text)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowPrompt(!showPrompt)} className="text-xs font-semibold text-hoop-400 hover:text-hoop-500">
            {showPrompt ? 'Hide' : 'Show'} the exact text
          </button>
          {showPrompt && (
            <button onClick={copy} className="text-xs font-semibold text-ink-400 hover:text-ink-100">
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
        {showPrompt && <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-court-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink-300 scrollbar-thin">{fullContext(game, [])}</pre>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel title="Long-term memory" right={<Pill color="#22c55e">never forgotten</Pill>}>
            <div className="space-y-5">
              <Block title="Career so far" empty="Written at the end of each season." >
                {st.careerSummary && <p className="text-sm leading-relaxed text-ink-300">{st.careerSummary}</p>}
              </Block>
              <Block title={`Defining moments (${st.defining.length}/10)`} empty="None yet. The narrator marks true turning points here.">
                {st.defining.length > 0 && (
                  <ul className="space-y-2 text-sm text-ink-300">
                    {st.defining.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-display font-semibold text-gold">★ S{d.season}</span>
                        <span>{d.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>
              <Block title="Season by season" empty="No seasons completed yet.">
                {st.seasonSummaries.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {[...st.seasonSummaries].reverse().map((s, i) => {
                      const window = st.careerSummary ? MEMORY_WINDOWS.seasonsWithCareer : MEMORY_WINDOWS.seasonsWithout;
                      const sent = i < window;
                      return (
                        <li key={s.season} className={cx('flex gap-2', sent ? 'text-ink-300' : 'text-ink-500')}>
                          <span className="font-display font-semibold text-hoop-400">S{s.season}</span>
                          <span className="flex-1">{s.text}</span>
                          {!sent && <span className="shrink-0 text-[10px] uppercase tracking-wider">folded into career</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Block>
            </div>
          </Panel>

          <Panel title="Working memory" right={<Pill color="#38bdf8">what is on its mind</Pill>}>
            <div className="space-y-5">
              <Block title="Threads to pay off" empty="Nothing hanging.">
                {st.threads.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-ink-300">
                    {st.threads.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-sky-400">↪</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </Block>
              <Block title="Open storylines" empty="No open storylines.">
                {st.arcs.some((a) => a.status === 'open') && (
                  <ul className="space-y-2 text-sm">
                    {st.arcs
                      .filter((a) => a.status === 'open')
                      .map((a) => (
                        <li key={a.id}>
                          <div className="font-semibold">{a.title}</div>
                          <div className="text-ink-400">{a.stakes}</div>
                        </li>
                      ))}
                  </ul>
                )}
              </Block>
              <Block title="Facts it was told" empty="No story flags set.">
                {Object.keys(st.flags).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(st.flags)
                      .filter(([k]) => !k.startsWith('declared') && k !== 'retiring')
                      .map(([k, v]) => (
                        <Pill key={k}>
                          {k.replace(/_/g, ' ')}: {String(v)}
                        </Pill>
                      ))}
                  </div>
                )}
              </Block>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Recent events" right={<span className="text-xs text-ink-500">last {MEMORY_WINDOWS.beats} are sent</span>}>
            {log.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing has happened yet.</p>
            ) : (
              <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {log.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    {i === MEMORY_WINDOWS.beats && (
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                        <span className="h-px flex-1 bg-court-600" />
                        beyond here the narrator has forgotten the details
                        <span className="h-px flex-1 bg-court-600" />
                      </div>
                    )}
                    <div className={cx('text-sm', i < MEMORY_WINDOWS.beats ? 'text-ink-100' : 'text-ink-500')}>
                      <span className="mr-2 font-mono text-[11px] text-ink-500">
                        S{e.season}W{e.week}
                      </span>
                      <span className="font-semibold">{e.title}</span>
                      <span className="text-ink-400"> · {e.summary}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Characters" right={<span className="text-xs text-ink-500">{totalMemories} memories stored</span>}>
            <RelationshipMap npcs={npcs} selected={selected} onSelect={setSelected} playerName={game.athletes[game.player.athleteId]?.firstName ?? 'You'} />
            {sel ? <NpcMemory npc={sel} /> : <p className="mt-3 text-sm text-ink-500">Pick a character to see what they remember. {active.length} are active.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Block({ title, empty, children }: { title: string; empty: string; children?: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-500">{title}</h4>
      {children || <p className="text-sm text-ink-500">{empty}</p>}
    </div>
  );
}

/** Radial graph: you in the middle; node size = memories, ring color = how they feel about you, edge weight = trust. */
function RelationshipMap({ npcs, selected, onSelect, playerName }: { npcs: Npc[]; selected: string | null; onSelect: (id: string | null) => void; playerName: string }) {
  const W = 560;
  const H = 380;
  const cx0 = W / 2;
  const cy0 = H / 2;
  const act = npcs.filter((n) => n.active);
  const gone = npcs.filter((n) => !n.active);
  const place = (i: number, n: number, rx: number, ry: number) => {
    const a = (Math.PI * 2 * i) / Math.max(1, n) - Math.PI / 2;
    return [cx0 + Math.cos(a) * rx, cy0 + Math.sin(a) * ry] as const;
  };
  const tone = (n: Npc) => (n.relationship.rivalry >= 40 && n.relationship.affinity < 10 ? '#ef4444' : n.relationship.romance >= 30 ? '#f472b6' : n.relationship.affinity >= 20 ? '#22c55e' : n.relationship.affinity <= -20 ? '#ef4444' : '#94a3b8');
  const radius = (n: Npc) => 12 + Math.min(10, n.memories.length * 1.4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label="Characters around you">
      {act.map((n, i) => {
        const [x, y] = place(i, act.length, 200, 135);
        return <line key={`l${n.id}`} x1={cx0} y1={cy0} x2={x} y2={y} stroke={tone(n)} strokeOpacity={0.45} strokeWidth={1 + n.relationship.trust / 25} />;
      })}
      <circle cx={cx0} cy={cy0} r={26} fill="var(--color-hoop-500)" fillOpacity={0.2} stroke="var(--color-hoop-500)" strokeWidth={2} />
      <text x={cx0} y={cy0 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-ink-100)">
        {playerName.split(' ')[0] || 'You'}
      </text>
      {[...act.map((n, i) => ({ n, p: place(i, act.length, 200, 135), off: false })), ...gone.slice(-6).map((n, i, arr) => ({ n, p: place(i + 0.5, arr.length, 255, 170), off: true }))].map(({ n, p, off }) => {
        const [x, y] = p;
        const r = off ? 8 : radius(n);
        const isSel = selected === n.id;
        return (
          <g key={n.id} onClick={() => onSelect(isSel ? null : n.id)} style={{ cursor: 'pointer' }} opacity={off ? 0.4 : 1} role="button" tabIndex={0} aria-label={`${n.name}, ${n.memories.length} memories`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(isSel ? null : n.id)}>
            <circle cx={x} cy={y} r={r} fill="var(--color-court-800)" stroke={tone(n)} strokeWidth={isSel ? 4 : 2.5} strokeDasharray={off ? '3 3' : undefined} />
            {!off && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="var(--color-ink-100)">
                {n.memories.length}
              </text>
            )}
            {(n.keyMemories?.length ?? 0) > 0 && !off && (
              <text x={x + r - 2} y={y - r + 6} fontSize={12} fill="var(--color-gold)">
                ★
              </text>
            )}
            <text x={x} y={y + r + 12} textAnchor="middle" fontSize={10} fill={isSel ? 'var(--color-hoop-400)' : 'var(--color-ink-300)'}>
              {n.name.split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function NpcMemory({ npc }: { npc: Npc }) {
  const sentFeatured = new Set(pinnedMemories(npc, MEMORY_WINDOWS.pinnedMemories));
  const key = new Set(npc.keyMemories ?? []);
  const r = npc.relationship;
  return (
    <div className="mt-2 rounded-lg border border-court-700 bg-court-900/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">
          {npc.name} <span className="text-xs font-normal text-ink-500">{npc.role.replace('_', ' ')}</span>
        </div>
        {!npc.active && <Pill>no longer around</Pill>}
      </div>
      <div className="text-xs text-ink-400">{npc.title}</div>
      <div className="mt-1 font-mono text-[11px] text-ink-500">
        affinity {r.affinity} · respect {r.respect} · trust {r.trust} · rivalry {r.rivalry}
        {r.romance ? ` · romance ${r.romance}` : ''}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {npc.memories.length === 0 && <li className="text-ink-500">Remembers nothing yet.</li>}
        {[...npc.memories].reverse().map((m, i) => {
          const sent = sentFeatured.has(m);
          return (
            <li key={i} className={cx('flex gap-2', sent ? 'text-ink-300' : 'text-ink-500')}>
              <span className="w-4 shrink-0 text-center">{key.has(m) ? <span className="text-gold">★</span> : sent ? '•' : '·'}</span>
              <span className="flex-1">{m}</span>
              {!sent && <span className="shrink-0 text-[10px] uppercase tracking-wider">stored only</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink-500">★ pinned, never pushed out. Bright = told to the narrator when this character is in a scene. Dim = still stored but not sent.</p>
    </div>
  );
}
