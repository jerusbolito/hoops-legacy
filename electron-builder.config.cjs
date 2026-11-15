/**
 * How the desktop app is packaged. Run through scripts/pack.mjs, which prepares the engine (and, for the full build,
 * the model) first.
 *
 *   standard build (default): the app + the built-in engine. A Windows installer of roughly 200 MB. The model
 *                             (7 GB) downloads once, the first time the game opens, after the player says yes.
 *   full build (HOOPS_FULL=1): the same, with the model inside the app, so it works offline from the first launch.
 *                             About 7.5 GB, and a zip rather than an installer: the Windows installer format (NSIS)
 *                             cannot hold more than 2 GB.
 */
const pins = require('./desktop/pins.json');
const { winSigningConfig } = require('./scripts/signing-config.cjs');

const signing = winSigningConfig();
const full = process.env.HOOPS_FULL === '1';
const modelId = process.env.HOOPS_MODEL || 'gemma-4-12b';
const model = pins.models.find((m) => m.id === modelId);
if (full && !model) throw new Error(`Unknown HOOPS_MODEL "${modelId}". Choose one of: ${pins.models.map((m) => m.id).join(', ')}`);

module.exports = {
  appId: 'com.hoopslegacy.app',
  productName: 'Hoops Legacy',
  directories: { output: process.env.HOOPS_OUT || (full ? 'release/full' : 'release'), buildResources: 'build' },
  // the game and the shell are each bundled into single files, so no node_modules are needed at runtime
  files: ['dist/**/*', 'desktop/dist/**/*', 'package.json', '!node_modules/**/*'],
  asar: true,
  // electron-builder fills in ${os} (win, mac, linux) and ${arch} (x64, arm64) for the machine it is building for
  extraResources: [
    { from: 'build/engine/${os}-${arch}', to: 'engine', filter: ['**/*', '!.pinned'] },
    ...(full ? [{ from: 'build/models', to: 'models', filter: [model.file] }] : []),
  ],
  // a model is already compressed, so squeezing it again only costs time
  compression: full ? 'store' : 'normal',
  // signing is switched on by environment variables (see scripts/signing-config.cjs); with none set the build is unsigned
  win: { target: full ? ['zip'] : ['nsis'], artifactName: full ? '${productName}-${version}-full-win.${ext}' : undefined, ...signing.win },
  // a fixed file name (no version, no spaces) so one permanent link always points at the newest release:
  // https://github.com/jerusbolito/hoops-legacy/releases/latest/download/Hoops-Legacy-Setup.exe
  // build/installer.nsh adds the uninstall step that removes downloaded story models (and keeps saved careers)
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false, artifactName: 'Hoops-Legacy-Setup.${ext}', include: 'build/installer.nsh' },
  mac: { target: full ? ['zip'] : ['dmg'], category: 'public.app-category.games' },
  linux: { target: full ? ['tar.gz'] : ['AppImage'], category: 'Game' },
};
