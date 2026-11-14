// Builds the desktop app. Gets everything it needs first (the game, the shell, the engine, and for --full, the model).
//   node scripts/pack.mjs               standard installer (engine included, model downloads on first launch)
//   node scripts/pack.mjs --full        the model inside the app too (about 7.5 GB, a zip, works offline immediately)
//   node scripts/pack.mjs --dir         an unpacked app folder only (fast, for testing the packaged app)
//   add --model=gemma-4-e4b to ship a smaller model in the full build
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const full = args.includes('--full');
const dirOnly = args.includes('--dir');
const model = args.find((a) => a.startsWith('--model='))?.slice('--model='.length) ?? 'gemma-4-12b';

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\nStopped: "${cmd}" failed.`);
    process.exit(r.status ?? 1);
  }
}

// Signing is on when the environment holds a certificate (see scripts/signing-config.cjs). A release can insist on it,
// so an unsigned build is never shipped by accident, and the check happens before the long build, not after.
const requireSigning = process.env.HOOPS_REQUIRE_SIGNING === '1';
const { winSigningConfig } = createRequire(import.meta.url)('./signing-config.cjs');
const signing = winSigningConfig(); // throws a clear message if signing is only half set up
console.log(`Windows signing: ${{ none: 'off (unsigned build)', pfx: 'certificate file', store: 'certificate in the Windows store', azure: 'Azure Artifact Signing' }[signing.mode]}`);
if (requireSigning && signing.mode === 'none') {
  console.error('\nHOOPS_REQUIRE_SIGNING=1 but no signing certificate is configured. See "Code signing" in the README.');
  process.exit(1);
}

run('npm run desktop:build');
run('node scripts/fetch-engine.mjs');
if (full) run(`node scripts/fetch-model.mjs ${model}`);
run(`npx electron-builder --config electron-builder.config.cjs${dirOnly ? ' --dir' : ''}`, {
  HOOPS_FULL: full ? '1' : '0',
  HOOPS_MODEL: model,
  // an unsigned build should not go looking for a signing certificate
  CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false',
});
const outDir = process.env.HOOPS_OUT || (full ? 'release/full' : 'release');
console.log(`\nDone. Output is in ${outDir}/`);
// look at the signatures that are really on the files, whatever the build said
if (process.platform === 'win32') run(`node scripts/verify-signature.mjs${requireSigning ? ' --require' : ''}`, { HOOPS_OUT: outDir });
