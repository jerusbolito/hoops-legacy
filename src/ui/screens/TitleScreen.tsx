import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { presetById } from '../../llm/presets';
import { deleteSave, exportSave, importSave, listSaves, loadGame, type SaveRow } from '../../state/persistence';
import { useStore } from '../../state/store';
import { Avatar, Button, Panel } from '../components/ui';
import { getDesktop } from '../../desktop/bridge';
import { WhatsNew } from '../components/WhatsNew';
import { HallOfFame } from '../components/Legacy';

// always the newest release (see electron-builder.config.cjs)
const DESKTOP_DOWNLOAD_URL = 'https://github.com/jerusbolito/hoops-legacy/releases/latest/download/Hoops-Legacy-Setup.exe';
// Apple Silicon only (see mac.artifactName in electron-builder.config.cjs)
const MAC_DOWNLOAD_URL = 'https://github.com/jerusbolito/hoops-legacy/releases/latest/download/Hoops-Legacy-Mac.dmg';

const onMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent);

const downloadCls = 'rounded-lg border border-hoop-500 px-4 py-2 text-sm font-semibold text-hoop-500 transition hover:bg-hoop-500 hover:text-white';

export function TitleScreen() {
  const [saves, setSaves] = useState<Omit<SaveRow, 'state'>[]>([]);
  const setScreen = useStore((s) => s.setScreen);
  const loadCareer = useStore((s) => s.loadCareer);
  const openCareer = useStore((s) => s.openCareer);
  const toast = useStore((s) => s.toast);
  const llm = useStore((s) => s.llm);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showNew, setShowNew] = useState(false);

  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    refresh();
  }, []);

  const doExport = async (id: string) => {
    const st = await loadGame(id);
    if (!st) return;
    const blob = new Blob([exportSave(st)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hoops-legacy-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (f: File) => {
    try {
      const st = importSave(await f.text());
      await openCareer(st);
      toast('Save imported', 'good');
    } catch (e) {
      toast(`Import failed: ${(e as Error).message.slice(0, 120)}`, 'bad');
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-10">
      {showNew && <WhatsNew onClose={() => setShowNew(false)} />}
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mb-10 text-center">
        <motion.div className="text-6xl" animate={{ y: [0, -14, 0] }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}>
          🏀
        </motion.div>
        <h1 className="mt-3 font-display text-6xl font-bold tracking-tight">
          HOOPS <span className="text-hoop-500">LEGACY</span>
        </h1>
        <p className="mt-2 text-ink-400">From the high school gym to the league. Every choice writes the story.</p>
      </motion.div>

      <div className="mb-6 flex flex-wrap justify-center gap-3">
        <Button className="px-6 py-3 text-base" onClick={() => setScreen('create')}>
          New Career
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          Import save
        </Button>
        <Button variant="ghost" onClick={() => setScreen('setup')}>
          ⚙ {llm ? presetById(llm.presetId).label : 'AI settings'}
        </Button>
        <Button variant="ghost" onClick={() => setShowNew(true)}>
          What's new
        </Button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      </div>

      {/* only on the website: the desktop app has no use for a link to itself */}
      {!getDesktop() && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-court-700 bg-court-850/80 px-4 py-3">
          <div className="min-w-0 text-sm">
            <div className="font-semibold">Play offline with a built-in AI</div>
            <div className="text-xs text-ink-400">The desktop app runs its own AI on your computer. No account or API key. Free. Windows, or Mac with Apple Silicon (M1 or later).</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(onMac() ? ['mac', 'win'] : ['win', 'mac']).map((p, k) => (
              <a key={p} href={p === 'mac' ? MAC_DOWNLOAD_URL : DESKTOP_DOWNLOAD_URL} className={k === 0 ? downloadCls : 'text-xs text-ink-400 underline hover:text-ink-200'}>
                Download for {p === 'mac' ? 'Mac' : 'Windows'}
              </a>
            ))}
          </div>
        </div>
      )}

      {saves.length > 0 && (
        <Panel title="Careers">
          <ul className="divide-y divide-court-700">
            {saves.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Avatar name={s.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.name}</div>
                  <div className="truncate text-xs text-ink-400">{s.subtitle}</div>
                  <div className="text-[11px] text-ink-500">{new Date(s.updatedAt).toLocaleString()}</div>
                </div>
                <Button onClick={() => loadCareer(s.id)}>Play</Button>
                <Button variant="ghost" title="Export" onClick={() => doExport(s.id)}>
                  ⤓
                </Button>
                <Button
                  variant="ghost"
                  title="Delete"
                  onClick={async () => {
                    if (confirm(`Delete ${s.name}'s career? This cannot be undone.`)) {
                      await deleteSave(s.id);
                      refresh();
                    }
                  }}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <HallOfFame />
    </div>
  );
}
