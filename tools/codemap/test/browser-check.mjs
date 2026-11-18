/**
 * Drives the real generated page in a headless Chromium browser and checks that search, navigation, the lazy call
 * tree, the graph, filters and the theme toggle all work, with no script errors. Needs a built page and a browser.
 *
 *   npm run codemap
 *   node tools/codemap/test/browser-check.mjs
 *
 * BROWSER=/path/to/chrome-or-edge to choose the browser (defaults to Edge on Windows, Chrome elsewhere).
 * It checks this project's own map (coaching.ts, advanceWeek...), so adjust those names for another project.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = process.env.BROWSER ?? (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const PAGE = pathToFileURL(path.resolve('codemap-out/index.html')).href;
const PORT = 9333;
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + path.join(os.tmpdir(), 'codemap-check'), '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.some((t) => t.type === 'page')) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d);
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: PAGE });
await sleep(1500);

const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);

// 1. map renders
check('map renders cards', (await ev(`document.querySelectorAll('.card').length`)) > 100, await ev(`document.querySelectorAll('.card').length + ' cards'`));

// 2. search finds a file and a function, and Enter opens the first hit
await ev(`(() => { const q = document.getElementById('q'); q.value = 'coaching'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
check('search shows results', (await ev(`document.querySelectorAll('#results button').length`)) > 2, await ev(`[...document.querySelectorAll('#results button')].slice(0,4).map(b => b.textContent.slice(0,40)).join(' | ')`));
await ev(`document.getElementById('q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
await sleep(300);
check('Enter opens the top hit', /^#(file|flow)\?id=/.test(await ev('location.hash')), await ev('location.hash'));

// 3. file page shows exports and uses
await ev(`location.hash = 'file?id=src/engine/coaching.ts'`);
await sleep(300);
check('file page shows its exports', (await ev(`document.querySelectorAll('main table tbody tr').length`)) > 10);
check('file page lists what it uses', /Uses \(\d+\)/.test(await ev(`document.querySelector('main').textContent`)));

// 4. clicking a link in a file page navigates
await ev(`document.querySelector('main .list .link').click()`);
await sleep(300);
check('clicking a used file opens it', (await ev('location.hash')).startsWith('#file?id=src/'), await ev('location.hash'));

// 5. a preset flow: opens, then expanding a node loads its children lazily
await ev(`location.hash = 'flow'`);
await sleep(200);
await ev(`document.querySelector('.presets button[data-id*="advanceWeek"]').click()`);
await sleep(300);
check('flow preset shows a call tree', (await ev(`document.querySelectorAll('.tree details').length`)) >= 2, await ev(`document.querySelectorAll('.tree details').length + ' nodes'`));
const before = await ev(`document.querySelectorAll('.tree details').length`);
await ev(`(() => { const d = [...document.querySelectorAll('.tree details')].find(x => !x.open && x.querySelector(':scope > .kids')); d.open = true; })()`);
await sleep(300);
const after = await ev(`document.querySelectorAll('.tree details, .tree .leaf').length`);
check('expanding a step loads its calls', after > before, `${before} -> ${after}`);

// 6. graph: pick a group, click a node, the highlight and info panel appear
await ev(`location.hash = 'graph?group=src/engine'`);
await sleep(300);
const nodes = await ev(`document.querySelectorAll('.node').length`);
check('graph draws the engine files', nodes > 40, nodes + ' nodes');
await ev(`document.querySelector('[data-node="src/engine/career.ts"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
await sleep(300);
check('clicking a node highlights its links', (await ev(`document.querySelectorAll('.edge.hi').length`)) > 0 && (await ev(`document.querySelectorAll('.node.dim').length`)) > 0, await ev(`document.querySelectorAll('.edge.hi').length + ' lit edges'`));

// 7. changes filter, rules, docs
await ev(`location.hash = 'changes'`);
await sleep(200);
const commitsBefore = await ev(`document.querySelectorAll('.commit').length`);
await ev(`(() => { const i = document.getElementById('cq'); i.value = 'coach'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(200);
const commitsAfter = await ev(`document.querySelectorAll('.commit').length`);
check('commit filter narrows the list', commitsAfter > 0 && commitsAfter < commitsBefore, `${commitsBefore} -> ${commitsAfter}`);
await ev(`location.hash = 'rules'`);
await sleep(200);
check('rules show passes and gotchas', (await ev(`document.querySelectorAll('.rule.ok').length`)) === 5 && (await ev(`document.querySelectorAll('.gotcha').length`)) >= 10);
await ev(`location.hash = 'docs'`);
await sleep(200);
check('docs render with a table of contents', (await ev(`document.querySelectorAll('.toc button').length`)) > 5 && (await ev(`document.querySelectorAll('.md table').length`)) > 0);
await ev(`document.querySelector('[data-doc="1"]').click()`);
await sleep(200);
check('switching to the changelog works', /1\.3\.0/.test(await ev(`document.querySelector('.md').textContent`)));

// 8. theme toggle
await ev(`document.getElementById('theme').click()`);
const theme = await ev(`document.documentElement.getAttribute('data-theme')`);
check('theme toggle sets a theme', theme === 'dark' || theme === 'light', theme);

// 9. a bad address does not break the page
await ev(`location.hash = 'file?id=src/does/not/exist.ts'`);
await sleep(200);
check('unknown file shows a message, not a crash', /No such file/.test(await ev(`document.querySelector('main').textContent`)));

check('no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
ws.close();
edge.kill();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
