import { useState } from 'react';
import { HOMETOWNS } from '../../data/names';
import { HS_TEAMS } from '../../data/teams';
import { TRAITS } from '../../engine/career';
import { ARCHETYPE_INFO, formatHeight } from '../../engine/ratings';
import type { Archetype, Position } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Button, Field, Panel, TeamBadge, cx, inputCls } from '../components/ui';

const HEIGHT_RANGE: Record<Position, [number, number]> = { PG: [70, 76], SG: [73, 78], SF: [76, 80], PF: [78, 82], C: [80, 85] };

export function CreateScreen() {
  const newCareer = useStore((s) => s.newCareer);
  const setScreen = useStore((s) => s.setScreen);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [hometown, setHometown] = useState(HOMETOWNS[0]);
  const [archetype, setArchetype] = useState<Archetype>('slasher');
  const [position, setPosition] = useState<Position>('SG');
  const [height, setHeight] = useState(75);
  const [school, setSchool] = useState(0);
  const [traits, setTraits] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pickArchetype = (a: Archetype) => {
    setArchetype(a);
    const pos = ARCHETYPE_INFO[a].positions[0];
    setPosition(pos);
    const [lo, hi] = HEIGHT_RANGE[pos];
    setHeight(Math.round((lo + hi) / 2));
  };
  const pickPosition = (p: Position) => {
    setPosition(p);
    const [lo, hi] = HEIGHT_RANGE[p];
    setHeight((h) => Math.min(hi, Math.max(lo, h)));
  };
  const toggleTrait = (id: string) => setTraits((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < 2 ? [...t, id] : t));

  // three school options: a powerhouse, a mid program, an underdog
  const schoolOptions = [1, 0, 7].map((i) => ({ i, t: HS_TEAMS[i] }));
  const [hlo, hhi] = HEIGHT_RANGE[position];

  const start = async () => {
    setBusy(true);
    await newCareer({ firstName: first, lastName: last, hometown, archetype, position, heightIn: height, schoolIndex: school, traits });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Create your player</h1>
        <Button variant="ghost" onClick={() => setScreen('title')}>
          ← Back
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input className={inputCls} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Jalen" maxLength={20} />
            </Field>
            <Field label="Last name">
              <input className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Carter" maxLength={20} />
            </Field>
            <Field label="Hometown">
              <select className={inputCls} value={hometown} onChange={(e) => setHometown(e.target.value)}>
                {HOMETOWNS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </Field>
            <Field label={`Height: ${formatHeight(height)}`}>
              <input type="range" min={hlo} max={hhi} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full accent-hoop-500" />
            </Field>
          </div>
        </Panel>

        <Panel title="Play style">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(ARCHETYPE_INFO) as Archetype[]).map((a) => (
              <button
                key={a}
                onClick={() => pickArchetype(a)}
                className={cx('rounded-lg border p-3 text-left transition-colors', a === archetype ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}
              >
                <div className="font-display font-semibold">{ARCHETYPE_INFO[a].label}</div>
                <div className="text-xs text-ink-400">{ARCHETYPE_INFO[a].blurb}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {ARCHETYPE_INFO[archetype].positions.map((p) => (
              <button key={p} onClick={() => pickPosition(p)} className={cx('rounded-md border px-3 py-1 font-mono text-sm', p === position ? 'border-hoop-500 text-hoop-400' : 'border-court-600 text-ink-400')}>
                {p}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Pick your high school">
          <div className="space-y-2">
            {schoolOptions.map(({ i, t }) => (
              <button key={t.name} onClick={() => setSchool(i)} className={cx('flex w-full items-center gap-3 rounded-lg border p-3 text-left', school === i ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
                <TeamBadge team={t} />
                <div className="flex-1">
                  <div className="font-semibold">
                    {t.name} {t.mascot}
                  </div>
                  <div className="text-xs text-ink-400">{t.prestige >= 75 ? 'Powerhouse. Stacked roster, you will have to earn minutes.' : t.prestige >= 50 ? 'Solid program. Room to grow into a starter.' : 'Underdog. The keys are yours if you want them.'}</div>
                </div>
                <div className="font-mono text-xs text-ink-400">PRS {t.prestige}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={`Traits (${traits.length}/2)`}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TRAITS.map((t) => (
              <button key={t.id} onClick={() => toggleTrait(t.id)} className={cx('rounded-lg border p-2.5 text-left', traits.includes(t.id) ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-xs text-ink-400">{t.desc}</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="px-8 py-3 text-base" disabled={!first.trim() || !last.trim() || busy} onClick={start}>
          Start career →
        </Button>
      </div>
    </div>
  );
}
