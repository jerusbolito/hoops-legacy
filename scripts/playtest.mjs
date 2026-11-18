// Runs the playtest and opens the dashboard.
//   npm run playtest            10 careers per row (a few minutes)
//   npm run playtest -- 30      30 careers per row (slower, steadier)
//   npm run playtest -- --open  open quality-report/playtest.html afterwards
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const n = args.find((a) => /^\d+$/.test(a)) ?? '10';
const open = args.includes('--open');

const r = spawnSync('npx', ['vitest', 'run', 'src/engine/playtest.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PLAYTEST: '1', PLAYTEST_N: n },
});

const page = resolve('quality-report', 'playtest.html');
console.log(`\nDashboard: ${page}`);
if (open && r.status === 0) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', page]] : process.platform === 'darwin' ? ['open', [page]] : ['xdg-open', [page]];
  spawnSync(cmd[0], cmd[1], { stdio: 'ignore' });
}
process.exit(r.status ?? 1);
