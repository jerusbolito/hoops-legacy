import { app, BrowserWindow, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isValidSelection, modelInfo, type EngineSelection, type PullProgress, type Provider } from '../src/desktop/bridge';
import { Engine, defaultDeps } from './engine';
import { LlamaEngine, defaultLlamaDeps } from './llama';
import { isBundledSimulation, isSimulation, simulatedDeps, simulatedLlamaDeps } from './simulate';
import { startStaticServer, type StaticServer } from './server';
import type { AIEngine } from './types';

/**
 * Come Up desktop shell. It serves the built game from a fixed local address, starts an AI engine for you (the
 * built-in model by default, or Ollama if you prefer), and gets out of the way. The game is the same code as the website.
 */

const SMOKE = process.argv.includes('--smoke');
const argValue = (name: string) => process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const smokeOut = argValue('--smoke-out');
// the self-check uses a throwaway profile, so it never touches a real player's saves or settings
if (SMOKE) app.setPath('userData', path.join(app.getPath('temp'), `hoops-legacy-smoke-${process.pid}`));

// In the self-check only, an engine can pretend to be in a state a brand-new player would see.
const simulate = SMOKE ? argValue('--smoke-engine') : undefined;

let server: StaticServer | null = null;
let mainWindow: BrowserWindow | null = null;
let engines: Record<Provider, AIEngine> | null = null;
let llama: LlamaEngine | null = null;

/** "win-x64", "mac-arm64", "linux-x64": the folder name an engine build is stored under. */
const platformKey = () => `${{ win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform as 'win32' | 'darwin' | 'linux'] ?? process.platform}-${process.arch}`;

/** Builds both engines once we know the game's own address (the only page the built-in engine will answer). */
function createEngines(origin: string): Record<Provider, AIEngine> {
  const appPath = app.getAppPath();
  const packaged = app.isPackaged;
  const llamaBase = defaultLlamaDeps({
    // shipped with the app: resources/engine and resources/models. In development: build/engine/<platform> and build/models
    engineRoots: [packaged ? path.join(process.resourcesPath, 'engine') : path.join(appPath, 'build', 'engine', platformKey())],
    modelDirs: [
      { dir: packaged ? path.join(process.resourcesPath, 'models') : path.join(appPath, 'build', 'models'), source: 'with-app' },
      { dir: path.join(app.getPath('userData'), 'models'), source: 'downloaded' },
    ],
    allowedOrigin: origin,
  });
  const ollamaBase = defaultDeps(packaged ? process.resourcesPath : undefined);
  llama = new LlamaEngine(isSimulation(simulate) && isBundledSimulation(simulate) ? simulatedLlamaDeps(simulate, llamaBase) : llamaBase);
  return {
    bundled: llama,
    ollama: new Engine(isSimulation(simulate) && !isBundledSimulation(simulate) ? simulatedDeps(simulate, ollamaBase) : ollamaBase),
  };
}

/** Only our own pages may use the bridge. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  return !!server && (url === server.url || url.startsWith(`${server.url}/`));
}

/** Checks who is asking and what they are asking for before anything runs. */
function guard<R>(fn: (e: IpcMainInvokeEvent, sel: EngineSelection, engine: AIEngine) => Promise<R> | R) {
  return async (e: IpcMainInvokeEvent, sel: unknown): Promise<R> => {
    if (!trusted(e)) throw new Error('Not allowed.');
    if (!isValidSelection(sel)) throw new Error('That is not a model this app can use.');
    const clean: EngineSelection = { provider: sel.provider, model: sel.model.trim() };
    return fn(e, clean, engines![clean.provider]);
  };
}

function registerIpc() {
  ipcMain.handle('desktop:status', guard((_e, sel, engine) => engine.status(sel.model)));
  ipcMain.handle('desktop:start', guard((_e, sel, engine) => engine.start(sel.model)));
  ipcMain.handle(
    'desktop:pull',
    guard(async (e, sel, engine) => {
      await engine.pull(sel.model, (p: PullProgress) => {
        if (!e.sender.isDestroyed()) e.sender.send('desktop:pull-progress', p);
      });
    }),
  );
  ipcMain.handle('desktop:warm', guard((_e, sel, engine) => engine.warm(sel.model)));
  // what this computer can run, and the model files on it: always answered by the built-in engine
  ipcMain.handle('desktop:hardware', async (e) => {
    if (!trusted(e)) throw new Error('Not allowed.');
    return llama!.hardware();
  });
  ipcMain.handle('desktop:models', async (e) => {
    if (!trusted(e)) throw new Error('Not allowed.');
    return llama!.installed();
  });
  ipcMain.handle('desktop:delete-model', async (e, id: unknown) => {
    if (!trusted(e)) throw new Error('Not allowed.');
    // only a model in the catalog can be named, so the page cannot point this at any other file
    if (typeof id !== 'string' || !modelInfo(id)) throw new Error('That is not a model this app can use.');
    llama!.remove(id);
  });
  ipcMain.handle('desktop:cancel-pull', async (e) => {
    if (!trusted(e)) throw new Error('Not allowed.');
    for (const engine of Object.values(engines!)) engine.cancelPull();
  });
  // a fixed, official address: the page cannot choose what gets opened
  ipcMain.handle('desktop:open-download', async (e) => {
    if (!trusted(e)) throw new Error('Not allowed.');
    await shell.openExternal('https://ollama.com/download');
  });
}

const stopEngines = () => {
  for (const engine of Object.values(engines ?? {})) engine.stop();
};

/** The game runs from its own folder, loads nothing from the web, and only talks to local or HTTPS addresses. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // the local AI engine, and whichever cloud AI provider a player chooses in settings
  "connect-src 'self' http://127.0.0.1:* http://localhost:* https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function hardenSession(origin: string) {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.webRequest.onHeadersReceived((details, cb) => {
    const headers = { ...details.responseHeaders };
    if (details.url.startsWith(origin)) headers['Content-Security-Policy'] = [CSP];
    cb({ responseHeaders: headers });
  });
}

function createWindow(url: string, show = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f17',
    title: 'Come Up',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--hoops-version=${app.getVersion()}`],
    },
  });
  if (show) win.once('ready-to-show', () => win.show());

  const openOutside = (target: string) => {
    try {
      if (new URL(target).protocol === 'https:') void shell.openExternal(target);
    } catch {
      /* not a URL */
    }
  };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    openOutside(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(url)) {
      e.preventDefault();
      openOutside(target);
    }
  });
  void win.loadURL(url);
  return win;
}

/**
 * A self-check that runs without a visible window, for building and testing.
 *   --smoke-out=<file>        write the result as JSON
 *   --smoke-seed=ollama|bundled   pretend the player already chose that provider (for a repeat launch)
 *   --smoke-engine=<state>    pretend to be a computer in some first-run state (see simulate.ts)
 *   --smoke-wait=<seconds>    how long to wait for the game to reach its title screen (default 40)
 *   --smoke-chat              one real request to whatever engine the game ends up using
 *   --smoke-click=<text>, --smoke-shot=<file>   press a button, then take a picture
 *   --smoke-eval=<file>       run a script in the page and report its result (with HOOPS_DIST=<folder> to serve another build)
 * Starting the real built-in engine is part of the check when it is present and nothing is simulated.
 */
async function smokeTest() {
  const result: Record<string, unknown> = { ok: false };
  try {
    const res = await fetch(`${server!.url}/`);
    result.servedIndex = res.ok && (await res.text()).includes('<div id="root">');

    const win = createWindow(server!.url, false);
    const errors: string[] = [];
    win.webContents.on('console-message', (e: unknown) => {
      const ev = e as { level?: string | number; message?: string };
      if (ev.level === 'error' || ev.level === 3) errors.push(String(ev.message));
    });
    const loaded = () =>
      new Promise<void>((resolve, reject) => {
        win.webContents.once('did-finish-load', () => resolve());
        win.webContents.once('did-fail-load', (_e, code, desc) => reject(new Error(`load failed: ${desc} (${code})`)));
      });
    await loaded();
    const js = <T,>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;

    // a repeat launch: the player has already chosen a provider
    const seed = argValue('--smoke-seed');
    if (seed === 'ollama' || seed === 'bundled') {
      const cfg = seed === 'ollama' ? { presetId: 'ollama', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'gemma4:12b', fastReplies: true } : { presetId: 'bundled', kind: 'openai-compatible', baseUrl: '', apiKey: '', model: 'gemma-4-12b', fastReplies: true };
      await js(`localStorage.setItem("hoops.llm", ${JSON.stringify(JSON.stringify(cfg))})`);
      const again = loaded();
      win.webContents.reload();
      await again;
    }
    await new Promise((r) => setTimeout(r, 1500));
    result.bridge = await js('typeof window.hoopsDesktop === "object" && window.hoopsDesktop.isDesktop === true');
    result.appRendered = await js('document.getElementById("root").children.length > 0');
    result.version = await js('window.hoopsDesktop && window.hoopsDesktop.appVersion');

    // what the game itself would decide to use: whatever it saved, otherwise the built-in model
    const chosen = await js<{ provider: Provider; model: string } | null>('(() => { try { const c = JSON.parse(localStorage.getItem("hoops.llm") || "null"); return c ? { provider: c.presetId === "ollama" ? "ollama" : "bundled", model: c.model } : null; } catch { return null; } })()');
    const sel: EngineSelection = chosen?.provider === 'ollama' ? { provider: 'ollama', model: chosen.model || 'gemma4:12b' } : { provider: 'bundled', model: 'gemma-4-12b' };
    const before = await engines![sel.provider].status(sel.model);
    result.engineBefore = { provider: before.provider, state: before.state, running: before.running, hasModel: before.hasModel, variant: before.engineVariant, ramGB: before.ramGB };

    // with everything in place the game should get itself ready and reach its title screen without any help
    const willAutoStart = before.state === 'ready' || (before.state === 'not-running' && before.hasModel);
    if (willAutoStart) {
      const waitMs = Number(argValue('--smoke-wait') ?? 40) * 1000;
      const t0 = Date.now();
      while (Date.now() - t0 < waitMs && !(await js<boolean>('document.body.innerText.includes("New Career")'))) await new Promise((r) => setTimeout(r, 500));
      result.secondsToTitle = Math.round((Date.now() - t0) / 100) / 10;
      result.reachedTitle = await js('document.body.innerText.includes("New Career")');
      const cfg = await js<{ presetId: string; baseUrl: string; model: string; apiKey: string; fastReplies?: boolean } | null>('(() => { try { return JSON.parse(localStorage.getItem("hoops.llm") || "null"); } catch { return null; } })()');
      result.savedConfig = cfg && { presetId: cfg.presetId, baseUrl: cfg.baseUrl, model: cfg.model, fastReplies: cfg.fastReplies };
      if (cfg?.baseUrl) {
        // the page's own address must be allowed to talk to the engine (this is what a real browser enforces)
        result.pageCanReachEngine = await js(`fetch(${JSON.stringify(cfg.baseUrl + '/models')}, { headers: ${JSON.stringify(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {})} }).then((r) => r.ok).catch(() => false)`);
        if (process.argv.includes('--smoke-chat')) {
          // one real, tiny, JSON-mode request shaped exactly like the game's own
          result.chat = await js(
            `(async () => { const t0 = Date.now(); try { const r = await fetch(${JSON.stringify(cfg.baseUrl + '/chat/completions')}, { method: "POST", headers: { "Content-Type": "application/json", ...(${JSON.stringify(cfg.apiKey)} ? { Authorization: "Bearer " + ${JSON.stringify(cfg.apiKey)} } : {}) }, body: JSON.stringify({ model: ${JSON.stringify(cfg.model)}, max_tokens: 200, reasoning_effort: "none", response_format: { type: "json_object" }, messages: [{ role: "system", content: "Reply with one JSON object and nothing else." }, { role: "user", content: "Return {\\"ok\\": true}" }] }) }); const j = await r.json(); return { status: r.status, text: j?.choices?.[0]?.message?.content, seconds: (Date.now() - t0) / 1000 }; } catch (e) { return { error: String(e) }; } })()`,
          );
        }
      }
    }
    // optionally run a script inside the page (needs a build that exposes the store, see README), and report what it returns
    const evalFile = argValue('--smoke-eval');
    if (evalFile) {
      result.eval = await js(readFileSync(evalFile, 'utf8'));
      await new Promise((r) => setTimeout(r, 1500));
      result.afterEval = await js('({ rootChildren: document.getElementById("root").children.length, textLength: document.body.innerText.length })');
    }
    // optionally press a button, then take a picture of what a player would see
    const clickText = argValue('--smoke-click');
    if (clickText) {
      result.clicked = await js<boolean>(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(${JSON.stringify(clickText)})); if (b) b.click(); return !!b; })()`);
      await new Promise((r) => setTimeout(r, 1500));
    }
    const shot = argValue('--smoke-shot');
    if (shot) {
      await new Promise((r) => setTimeout(r, 2500));
      const img = await win.webContents.capturePage();
      writeFileSync(shot, img.toPNG());
      result.screenshot = { path: shot, empty: img.isEmpty(), size: img.getSize() };
      result.screenText = (await js<string>('document.body.innerText')).slice(0, 700);
    }
    result.consoleErrors = errors;
    result.ok = !!(result.servedIndex && result.bridge && result.appRendered && errors.length === 0 && (!willAutoStart || (result.reachedTitle && result.pageCanReachEngine !== false)));
  } catch (e) {
    result.error = String((e as Error).message ?? e);
  }
  if (smokeOut) writeFileSync(smokeOut, JSON.stringify(result, null, 2));
  console.log('SMOKE', JSON.stringify(result));
  stopEngines();
  app.exit(result.ok ? 0 : 1);
}

async function boot() {
  // the self-check can serve a different build of the game (for example one that exposes the store for scripted checks)
  const root = SMOKE && process.env.HOOPS_DIST ? path.resolve(process.env.HOOPS_DIST) : path.join(app.getAppPath(), 'dist');
  server = await startStaticServer(root);
  engines = createEngines(server.url);
  hardenSession(server.url);
  registerIpc();
  if (SMOKE) return void (await smokeTest());
  mainWindow = createWindow(server.url);
  mainWindow.on('closed', () => (mainWindow = null));
}

if (!app.requestSingleInstanceLock() && !SMOKE) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(boot, (e) => {
    console.error(e);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  // we only stop an engine that this app started; yours is left running
  app.on('before-quit', stopEngines);
  process.on('exit', stopEngines);
}
