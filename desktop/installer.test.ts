import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const nsh = readFileSync('build/installer.nsh', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string };
const config = createRequire(import.meta.url)('../electron-builder.config.cjs') as { nsis: { include?: string } };

/** The lines that do something (not comments, not blank). */
const code = nsh.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith(';'));

describe('uninstalling the game', () => {
  it('is hooked into the Windows installer', () => {
    expect(config.nsis.include).toBe('build/installer.nsh');
    expect(code[0]).toBe('!macro customUnInstall');
    expect(code[code.length - 1]).toBe('!macroend');
  });

  it('removes downloaded models from the folder the game really uses (Electron names it after package.json)', () => {
    const rm = code.filter((l) => /^RMDir/i.test(l));
    expect(rm).toEqual([`RMDir /r "$APPDATA\\${pkg.name}\\models"`]);
  });

  it('keeps saved careers and settings: it only ever deletes the models folder, never the whole data folder', () => {
    for (const l of code.filter((x) => /RMDir|Delete/i.test(x))) expect(l).toMatch(/\\models"$/);
    expect(nsh).not.toMatch(/deleteAppData/i);
  });

  it('does not delete on an update, so a new version does not make everyone download 7 GB again', () => {
    const body = code.join('\n');
    expect(body).toMatch(/\$\{ifNot\} \$\{isUpdated\}[\s\S]*RMDir[\s\S]*\$\{endIf\}/);
  });
});
