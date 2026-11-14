// Bundles the desktop shell (main process + preload) with esbuild. The game itself is built by Vite into dist/.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['desktop/main.ts'], outfile: 'desktop/dist/main.cjs' });
await build({ ...common, entryPoints: ['desktop/preload.ts'], outfile: 'desktop/dist/preload.cjs' });
