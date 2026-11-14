import { execFileSync } from 'node:child_process';

/**
 * Reads the digital signature off Windows programs, so a release can be checked rather than trusted.
 * Plain erasable TypeScript with only Node built-ins: build scripts run it directly.
 */

/**
 *  - valid:     signed, and Windows trusts the signer. This is what a release should be.
 *  - untrusted: signed, but by someone Windows does not trust (a test certificate, or a missing chain).
 *  - unsigned:  no signature at all.
 *  - broken:    signed, but the file has been changed since, or the signature is unusable.
 */
export type SigState = 'valid' | 'untrusted' | 'unsigned' | 'broken';

export interface SigInfo {
  file: string;
  state: SigState;
  /** PowerShell's own word for it: Valid, NotSigned, HashMismatch, NotTrusted, UnknownError... */
  status: string;
  message: string;
  subject: string;
  thumbprint: string;
  notAfter: string;
  /** A timestamp lets the signature outlive the certificate. */
  timestamped: boolean;
}

export function classify(status: string, hasSigner: boolean): SigState {
  switch (status) {
    case 'Valid':
      return 'valid';
    case 'NotSigned':
    case 'NotSupportedFileFormat':
      return 'unsigned';
    case 'HashMismatch':
    case 'Incompatible':
      return 'broken';
    // the signature is intact but the chain ends somewhere Windows does not trust
    case 'NotTrusted':
    case 'UnknownError':
      return hasSigner ? 'untrusted' : 'broken';
    default:
      return hasSigner ? 'untrusted' : 'unsigned';
  }
}

const SCRIPT = `
$files = $env:HOOPS_FILES | ConvertFrom-Json
$out = foreach ($f in @($files)) {
  $s = Get-AuthenticodeSignature -LiteralPath $f
  [pscustomobject]@{
    file = $f
    status = [string]$s.Status
    message = [string]$s.StatusMessage
    subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '' }
    thumbprint = if ($s.SignerCertificate) { $s.SignerCertificate.Thumbprint } else { '' }
    notAfter = if ($s.SignerCertificate) { $s.SignerCertificate.NotAfter.ToString('yyyy-MM-dd') } else { '' }
    timestamped = [bool]$s.TimeStamperCertificate
  }
}
ConvertTo-Json -Compress -InputObject @($out)
`;

/** Windows only. Returns one entry per file, in the same order. */
export function readSignatures(files: string[], run: typeof execFileSync = execFileSync): SigInfo[] {
  if (!files.length) return [];
  const raw = run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, HOOPS_FILES: JSON.stringify(files) },
    windowsHide: true,
  }) as string;
  const rows = JSON.parse(raw) as Omit<SigInfo, 'state'>[];
  return rows.map((r) => ({ ...r, state: classify(r.status, !!r.thumbprint) }));
}
