import { useMemo, useState, type ReactNode } from 'react';
import { HOMETOWNS } from '../../data/names';
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, setLookOverride } from '../../data/looks';
import { HS_TEAMS } from '../../data/teams';
import { TRAITS } from '../../engine/career';
import { WEEKLY_ALLOWANCE } from '../../engine/finance';
import { BACKGROUNDS, BUILDS, MOTIVES, TEMPERAMENTS, BUILD_SHIFT, goalForMotive, modsFor, type Choice } from '../../engine/origin';
import { ARCHETYPE_INFO, formatHeight } from '../../engine/ratings';
import type { Archetype, Background, Build, Motive, Position, Temperament } from '../../state/schemas';
import { useStore } from '../../state/store';
import { Portrait } from '../components/Portrait';
import { Button, Field, Panel, TeamBadge, cx, inputCls } from '../components/ui';

const HEIGHT_RANGE: Record<Position, [number, number]> = { PG: [70, 76], SG: [73, 78], SF: [76, 80], PF: [78, 82], C: [80, 85] };

/** The motives a new player can pick. "Carry the name" belongs to heirs. */
const PICKABLE_MOTIVES = MOTIVES.filter((m) => m.id !== 'legacy');

const GOAL_LABEL: Record<string, string> = {
  rival: 'Beat your rival head to head',
  money: 'Build a fortune',
  ovr: 'Reach elite ratings',
  followers: 'Build a huge following',
  surpass: "Out-achieve your parent",
};

const pct = (x: number) => `${x >= 1 ? '+' : '−'}${Math.abs(Math.round((x - 1) * 100))}%`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

/** One option with what it gives and what it costs, so the trade is visible before it is made. */
function ChoiceCard<T extends string>({ c, on, pick }: { c: Pick<Choice<T>, 'id' | 'label' | 'icon' | 'blurb' | 'perks' | 'costs'>; on: boolean; pick: (id: T) => void }) {
  return (
    <button
      onClick={() => pick(c.id)}
      aria-pressed={on}
      className={cx('rounded-lg border p-3 text-left transition-colors', on ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {c.icon}
        </span>
        <span className="font-display font-semibold">{c.label}</span>
      </div>
      <div className="mt-1 text-xs text-ink-400">{c.blurb}</div>
      {on && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {c.perks.map((t) => (
            <li key={t} className="text-win">
              <span aria-hidden>+ </span>
              {t}
            </li>
          ))}
          {c.costs.map((t) => (
            <li key={t} className="text-loss">
              <span aria-hidden>− </span>
              {t}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {colors.map((c, i) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === i}
          aria-label={`${label} ${i + 1}`}
          onClick={() => onPick(i)}
          className={cx('h-10 w-10 rounded-full border-2 sm:h-7 sm:w-7', value === i ? 'border-hoop-400 ring-2 ring-hoop-500/40' : 'border-court-600')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title}>
      {hint && <p className="mb-3 text-xs text-ink-400">{hint}</p>}
      {children}
    </Panel>
  );
}

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
  const [background, setBackground] = useState<Background>('working');
  const [motive, setMotive] = useState<Motive>('love');
  const [temperament, setTemperament] = useState<Temperament>('steady');
  const [skin, setSkin] = useState(3);
  const [hair, setHair] = useState(0);
  const [style, setStyle] = useState('short');
  const [build, setBuild] = useState<Build>('balanced');
  const [number, setNumber] = useState(() => 1 + Math.floor(Math.random() * 44));
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
  const team = HS_TEAMS[school];

  // the preview face: the look is registered under the name being typed, and the portrait is rebuilt whenever it changes
  const previewName = `${first.trim() || 'Your'} ${last.trim() || 'Player'}`;
  setLookOverride(previewName, { skin, hair, style, number });
  const lookKey = `${previewName}|${skin}|${hair}|${style}|${number}`;

  const m = useMemo(() => modsFor({ background, motive, temperament }), [background, motive, temperament]);
  const shift = BUILD_SHIFT[build];
  const chosenBuild = BUILDS.find((b) => b.id === build)!;
  const bg = BACKGROUNDS.find((b) => b.id === background)!;
  const mo = MOTIVES.find((b) => b.id === motive)!;
  const te = TEMPERAMENTS.find((b) => b.id === temperament)!;

  const start = async () => {
    setBusy(true);
    await newCareer({
      firstName: first,
      lastName: last,
      hometown,
      archetype,
      position,
      heightIn: height,
      schoolIndex: school,
      traits,
      origin: { background, motive, temperament, look: { skin, hair, style, build, number } },
    });
  };

  const money = Math.round(m.money);
  const allowance = Math.round(WEEKLY_ALLOWANCE.hs * m.allowance);
  const rows: { label: string; value: string; good: boolean | null }[] = [
    { label: 'Starting money', value: `$${money.toLocaleString()}`, good: null },
    { label: 'Weekly allowance (high school)', value: `$${allowance}`, good: allowance > WEEKLY_ALLOWANCE.hs ? true : allowance < WEEKLY_ALLOWANCE.hs ? false : null },
    { label: 'Training', value: pct(m.trainingMul), good: m.trainingMul === 1 ? null : m.trainingMul > 1 },
    { label: 'Reputation growth', value: pct(m.repGain), good: m.repGain === 1 ? null : m.repGain > 1 },
    { label: 'Followers growth', value: pct(m.followerMul), good: m.followerMul === 1 ? null : m.followerMul > 1 },
    { label: 'Brand deals', value: pct(m.endorseMul), good: m.endorseMul === 1 ? null : m.endorseMul > 1 },
    { label: 'Morale hit from a loss', value: pct(m.moraleLossMul), good: m.moraleLossMul === 1 ? null : m.moraleLossMul < 1 },
    { label: 'Starting ratings', value: signed(Math.round(m.ratingBoost)), good: m.ratingBoost === 0 ? null : m.ratingBoost > 0 },
    { label: 'Coach starts at', value: `trust ${signed(Math.round(m.coachTrust))}, respect ${signed(Math.round(m.coachRespect))}`, good: m.coachTrust + m.coachRespect === 0 ? null : m.coachTrust + m.coachRespect > 0 },
    { label: 'Locker room', value: `chemistry ${signed(Math.round(m.chem))}`, good: m.chem === 0 ? null : m.chem > 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Create your player</h1>
        <Button variant="ghost" onClick={() => setScreen('title')}>
          ← Back
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Section title="Identity">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </Section>

          <Section title="Where you come from" hint="Your family decides what you start with, who is in your corner, and what keeps coming up at home. Every background has a price.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BACKGROUNDS.map((b) => (
                <ChoiceCard key={b.id} c={b} on={b.id === background} pick={setBackground} />
              ))}
            </div>
          </Section>

          <Section title="Why you play" hint="This is your story's driving force. It sets your first long-term goal, and it decides which moments come looking for you.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PICKABLE_MOTIVES.map((b) => (
                <ChoiceCard key={b.id} c={b} on={b.id === motive} pick={setMotive} />
              ))}
            </div>
          </Section>

          <Section title="How you carry yourself" hint="Temperament is how you handle pressure and people. It shapes how coaches, teammates and the press react to you.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEMPERAMENTS.map((b) => (
                <ChoiceCard key={b.id} c={b} on={b.id === temperament} pick={setTemperament} />
              ))}
            </div>
          </Section>

          <Section title="Play style">
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
                <button key={p} onClick={() => pickPosition(p)} className={cx('rounded-md border px-4 py-2 font-mono text-sm sm:px-3 sm:py-1', p === position ? 'border-hoop-500 text-hoop-400' : 'border-court-600 text-ink-400')}>
                  {p}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Look and build" hint="Your build shifts a few ratings around (it never adds any). The look is yours alone: it is the face in the paper, on your card and on the court.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Skin tone">
                <Swatches colors={SKIN_TONES} value={skin} onPick={setSkin} label="Skin tone" />
              </Field>
              <Field label="Hair color">
                <Swatches colors={HAIR_COLORS.map((h) => h.c)} value={hair} onPick={setHair} label="Hair color" />
              </Field>
              <Field label="Hair style">
                <div className="flex flex-wrap gap-1.5">
                  {HAIR_STYLES.map((h) => (
                    <button key={h.id} onClick={() => setStyle(h.id)} aria-pressed={style === h.id} className={cx('rounded-md border px-3 py-2 text-xs sm:px-2.5 sm:py-1', style === h.id ? 'border-hoop-500 text-hoop-400' : 'border-court-600 text-ink-400')}>
                      {h.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Jersey number">
                <input type="number" min={0} max={99} className={inputCls} value={number} onChange={(e) => setNumber(Math.max(0, Math.min(99, Math.floor(Number(e.target.value) || 0))))} />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {BUILDS.map((b) => (
                <ChoiceCard key={b.id} c={b} on={b.id === build} pick={setBuild} />
              ))}
            </div>
          </Section>

          <Section title="Pick your high school">
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
          </Section>

          <Section title={`Traits (${traits.length}/2)`}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TRAITS.map((t) => (
                <button key={t.id} onClick={() => toggleTrait(t.id)} className={cx('rounded-lg border p-2.5 text-left', traits.includes(t.id) ? 'border-hoop-500 bg-hoop-500/10' : 'border-court-600 hover:border-court-500')}>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-ink-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Panel title="Your story so far">
            <div className="flex items-center gap-3">
              <Portrait key={lookKey} name={previewName} size={96} colors={team.colors} mood="happy" ring={team.colors[1]} />
              <div className="min-w-0">
                <div className="font-display text-xl leading-tight font-bold">{previewName}</div>
                <div className="text-xs text-ink-400">
                  {position} · {formatHeight(height)} · {chosenBuild.label}
                </div>
                <div className="text-xs text-ink-500">
                  #{number} · {hometown}
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              {bg.icon} {bg.label}. {mo.icon} {mo.label.toLowerCase()}. {te.icon} {te.label.toLowerCase()}.
            </p>
            <p className="mt-1 text-xs text-ink-500">
              First goal: <span className="text-ink-300">{GOAL_LABEL[goalForMotive(motive)]}</span>.
              {Object.keys(shift).length > 0 && ' Your build shifts a few ratings.'}
            </p>
            <dl className="mt-4 space-y-1.5 border-t border-court-700 pt-3 text-xs">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-400">{r.label}</dt>
                  <dd className={cx('font-mono', r.good === true && 'text-win', r.good === false && 'text-loss')}>{r.value}</dd>
                </div>
              ))}
            </dl>
            <Button className="mt-5 w-full py-3 text-base" disabled={!first.trim() || !last.trim() || busy} onClick={start}>
              Start career →
            </Button>
            {(!first.trim() || !last.trim()) && <p className="mt-2 text-center text-xs text-ink-500">Give your player a first and last name.</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
