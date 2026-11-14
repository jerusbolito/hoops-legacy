// Starts Electron on this project. Some editors set ELECTRON_RUN_AS_NODE for their own use, which makes Electron
// behave like plain Node and fail to open a window, so it is cleared here.
import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (e) => {
  console.error('Could not start Electron:', e.message);
  process.exit(1);
});
