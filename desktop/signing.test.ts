import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { classify, readSignatures } from './signature';

const { winSigningConfig, AZURE_KEYS } = createRequire(import.meta.url)('../scripts/signing-config.cjs') as {
  winSigningConfig: (env?: Record<string, string | undefined>) => { mode: string; win: Record<string, Record<string, unknown>> };
  AZURE_KEYS: string[];
};

describe('which way the build is signed', () => {
  it('is unsigned when nothing is configured, and still asks for a timestamp and modern signatures if a certificate shows up', () => {
    const c = winSigningConfig({});
    expect(c.mode).toBe('none');
    expect(c.win.signtoolOptions).toMatchObject({ signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: 'http://timestamp.digicert.com' });
    expect(c.win.azureSignOptions).toBeUndefined();
  });

  it('uses a certificate file when one is given, with its password', () => {
    expect(winSigningConfig({ CSC_LINK: 'C:\\keys\\cert.pfx', CSC_KEY_PASSWORD: 'pw' }).mode).toBe('pfx');
    expect(winSigningConfig({ WIN_CSC_LINK: 'C:\\keys\\cert.pfx', WIN_CSC_KEY_PASSWORD: 'pw' }).mode).toBe('pfx');
  });

  it('refuses a certificate file with no password rather than failing in the middle of a long build', () => {
    expect(() => winSigningConfig({ CSC_LINK: 'C:\\keys\\cert.pfx' })).toThrow(/CSC_KEY_PASSWORD/);
    expect(winSigningConfig({ CSC_LINK: 'C:\\keys\\cert.pfx', HOOPS_ALLOW_PFX_WITHOUT_PASSWORD: '1' }).mode).toBe('pfx');
  });

  it('uses a certificate in the Windows store (USB token, cloud HSM), by thumbprint or name', () => {
    const sha = 'AB'.repeat(20);
    const byHash = winSigningConfig({ HOOPS_SIGN_SHA1: sha });
    expect(byHash.mode).toBe('store');
    expect(byHash.win.signtoolOptions.certificateSha1).toBe(sha);
    // a thumbprint is often copied with spaces
    expect(winSigningConfig({ HOOPS_SIGN_SHA1: 'ab cd '.repeat(10).trim() }).win.signtoolOptions.certificateSha1).toBe('abcd'.repeat(10));
    const byName = winSigningConfig({ HOOPS_SIGN_SUBJECT: 'Jane Smith' });
    expect(byName.mode).toBe('store');
    expect(byName.win.signtoolOptions.certificateSubjectName).toBe('Jane Smith');
  });

  it('rejects a thumbprint that is not one', () => {
    expect(() => winSigningConfig({ HOOPS_SIGN_SHA1: 'not-a-thumbprint' })).toThrow(/40 hexadecimal/);
    expect(() => winSigningConfig({ HOOPS_SIGN_SHA1: 'ab'.repeat(19) })).toThrow(/40 hexadecimal/);
  });

  it('uses Azure Artifact Signing when it is fully set up, and then does not also use signtool', () => {
    const env = { HOOPS_AZURE_ENDPOINT: 'https://eus.codesigning.azure.net', HOOPS_AZURE_ACCOUNT: 'acct', HOOPS_AZURE_PROFILE: 'profile', HOOPS_PUBLISHER: 'Jane Smith' };
    const c = winSigningConfig(env);
    expect(c.mode).toBe('azure');
    expect(c.win.azureSignOptions).toMatchObject({ publisherName: 'Jane Smith', endpoint: env.HOOPS_AZURE_ENDPOINT, codeSigningAccountName: 'acct', certificateProfileName: 'profile' });
    // electron-builder will not take both, and Azure wins if both are present
    expect(c.win.signtoolOptions).toBeUndefined();
  });

  it('fails loudly if Azure is only partly set up, naming what is missing, instead of quietly shipping unsigned', () => {
    for (const present of AZURE_KEYS) {
      const env = { [present]: 'x' };
      const missing = AZURE_KEYS.filter((k) => k !== present);
      expect(() => winSigningConfig(env)).toThrow(new RegExp(`Also set: ${missing.join(', ')}`));
    }
  });

  it('lets the timestamp server be changed', () => {
    expect(winSigningConfig({ HOOPS_TIMESTAMP_URL: 'http://timestamp.example/ts' }).win.signtoolOptions.rfc3161TimeStampServer).toBe('http://timestamp.example/ts');
  });
});

describe('reading signatures', () => {
  it('sorts what Windows says into four plain states', () => {
    expect(classify('Valid', true)).toBe('valid');
    expect(classify('NotSigned', false)).toBe('unsigned');
    expect(classify('NotSupportedFileFormat', false)).toBe('unsigned');
    expect(classify('HashMismatch', true)).toBe('broken');
    // a test or self-made certificate: the signature is there, Windows just does not trust the signer
    expect(classify('UnknownError', true)).toBe('untrusted');
    expect(classify('NotTrusted', true)).toBe('untrusted');
    // an error with no signer at all is not a signature
    expect(classify('UnknownError', false)).toBe('broken');
  });

  it('turns the PowerShell output into one entry per file', () => {
    const fake = ((_cmd: string, _args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      const files = JSON.parse(opts.env.HOOPS_FILES!) as string[];
      return JSON.stringify(
        files.map((file, i) => ({ file, status: i === 0 ? 'Valid' : 'NotSigned', message: '', subject: i === 0 ? 'CN=Jane Smith' : '', thumbprint: i === 0 ? 'ABC' : '', notAfter: '2027-01-01', timestamped: i === 0 })),
      );
    }) as never;
    const rows = readSignatures(['C:\\a.exe', 'C:\\b.exe'], fake);
    expect(rows.map((r) => r.state)).toEqual(['valid', 'unsigned']);
    expect(rows[0]).toMatchObject({ file: 'C:\\a.exe', subject: 'CN=Jane Smith', timestamped: true });
    expect(readSignatures([], fake)).toEqual([]);
  });

  it('copes with a single file, which PowerShell may print as one object instead of a list', () => {
    const fake = (() => JSON.stringify([{ file: 'x', status: 'NotSigned', message: '', subject: '', thumbprint: '', notAfter: '', timestamped: false }])) as never;
    expect(readSignatures(['x'], fake)).toHaveLength(1);
  });
});
