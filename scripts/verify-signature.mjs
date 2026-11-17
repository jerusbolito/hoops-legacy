// Shows whether the Windows build is really signed, by reading the signature off each file.
//   node scripts/verify-signature.mjs                       the installer and the app's own programs in release/
//   node scripts/verify-signature.mjs <file> [<file>...]    specific files
//   add --require to exit with an error unless every file is signed by a signer Windows trusts
//   add --allow-untrusted with --require to accept a test certificate (for checking the pipeline only)
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readSignatures } from '../desktop/signature.ts';

const args = process.argv.slice(2);
const require_ = args.includes('--require');
const allowUntrusted = args.includes('--allow-untrusted');
const out = process.env.HOOPS_OUT || 'release';
let files = args.filter((a) => !a.startsWith('--'));

if (process.platform !== 'win32') {
  console.log('Signature checking reads Windows signatures, so it only runs on Windows. Skipped.');
  process.exit(0);
}

if (!files.length) {
  // the installer, the main program, and the programs the app runs
  if (existsSync(out)) for (const f of readdirSync(out)) if (f.toLowerCase().endsWith('.exe')) files.push(path.join(out, f));
  const unpacked = path.join(out, 'win-unpacked');
  if (existsSync(unpacked)) {
    files.push(path.join(unpacked, 'Come Up.exe'));
    const engine = path.join(unpacked, 'resources', 'engine');
    if (existsSync(engine)) for (const v of readdirSync(engine)) files.push(path.join(engine, v, 'llama-server.exe'));
  }
  files = files.filter((f) => existsSync(f));
}
if (!files.length) {
  console.error(`No programs to check in ${out}/. Build first (npm run desktop:pack).`);
  process.exit(1);
}

const rows = readSignatures(files.map((f) => path.resolve(f)));
const label = { valid: 'SIGNED, trusted', untrusted: 'signed, NOT trusted', unsigned: 'UNSIGNED', broken: 'BROKEN' };
for (const r of rows) {
  const detail = r.state === 'unsigned' ? '' : `  ${r.subject.replace(/^CN=/, '').split(',')[0]}  expires ${r.notAfter}  ${r.timestamped ? 'timestamped' : 'NO timestamp'}`;
  console.log(`${label[r.state].padEnd(20)} ${path.relative(process.cwd(), r.file)}${detail}`);
}

const ok = (r) => r.state === 'valid' || (allowUntrusted && r.state === 'untrusted');
const bad = rows.filter((r) => !ok(r));
if (require_ && bad.length) {
  console.error(`\n${bad.length} of ${rows.length} file(s) are not properly signed. A release must not ship like this.`);
  process.exit(1);
}
if (!require_ && bad.length) console.log(`\n${bad.length} of ${rows.length} file(s) are not signed by a trusted signer. (Add --require to make that an error.)`);
