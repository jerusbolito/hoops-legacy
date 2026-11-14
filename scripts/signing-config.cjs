/**
 * Which way (if any) the Windows build gets signed, decided from environment variables. No secret is ever kept in a
 * file. Three routes, because certificate authorities now deliver keys in three different ways:
 *
 *   1. A certificate file (.pfx)            CSC_LINK=<path or base64>   CSC_KEY_PASSWORD=<password>
 *   2. A certificate in the Windows store   HOOPS_SIGN_SHA1=<40-hex thumbprint>   (or HOOPS_SIGN_SUBJECT=<name>)
 *      This is how a USB token or a cloud-HSM client (SSL.com eSigner, DigiCert KeyLocker...) presents its key.
 *   3. Azure Artifact Signing               HOOPS_AZURE_ENDPOINT, HOOPS_AZURE_ACCOUNT, HOOPS_AZURE_PROFILE, HOOPS_PUBLISHER
 *      plus the standard AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET that Microsoft's signing module reads.
 *
 * With none of them set the build is unsigned, exactly as before. A half-filled route is an error, not a silent skip,
 * so a release is never quietly shipped unsigned. Written for electron-builder 26 (the option names change in 27).
 */

const AZURE_KEYS = ['HOOPS_AZURE_ENDPOINT', 'HOOPS_AZURE_ACCOUNT', 'HOOPS_AZURE_PROFILE', 'HOOPS_PUBLISHER'];

/** A timestamp keeps the signature valid after the certificate itself expires. */
const DEFAULT_TIMESTAMP = 'http://timestamp.digicert.com';

function winSigningConfig(env = process.env) {
  const timestamp = env.HOOPS_TIMESTAMP_URL || DEFAULT_TIMESTAMP;

  // Route 3: Azure
  const azureSet = AZURE_KEYS.filter((k) => env[k]);
  if (azureSet.length > 0) {
    const missing = AZURE_KEYS.filter((k) => !env[k]);
    if (missing.length) throw new Error(`Azure signing is only partly set up. Also set: ${missing.join(', ')}.`);
    return {
      mode: 'azure',
      win: {
        azureSignOptions: {
          publisherName: env.HOOPS_PUBLISHER,
          endpoint: env.HOOPS_AZURE_ENDPOINT,
          codeSigningAccountName: env.HOOPS_AZURE_ACCOUNT,
          certificateProfileName: env.HOOPS_AZURE_PROFILE,
          ...(env.HOOPS_TIMESTAMP_URL ? { timestampRfc3161: env.HOOPS_TIMESTAMP_URL } : {}),
        },
      },
    };
  }

  // Routes 1 and 2 go through signtool. SHA-1 signatures are obsolete, and signing twice doubles any PIN prompts.
  const sha1 = (env.HOOPS_SIGN_SHA1 || '').replace(/\s+/g, '');
  const subject = env.HOOPS_SIGN_SUBJECT || '';
  if (sha1 && !/^[0-9a-fA-F]{40}$/.test(sha1)) throw new Error('HOOPS_SIGN_SHA1 must be the certificate thumbprint: 40 hexadecimal characters.');
  const pfx = env.CSC_LINK || env.WIN_CSC_LINK;
  if (pfx && !(env.CSC_KEY_PASSWORD || env.WIN_CSC_KEY_PASSWORD) && !/^https?:|^file:/.test(pfx) && env.HOOPS_ALLOW_PFX_WITHOUT_PASSWORD !== '1') {
    throw new Error('CSC_LINK is set but CSC_KEY_PASSWORD is not. Set the certificate password (or HOOPS_ALLOW_PFX_WITHOUT_PASSWORD=1 if it really has none).');
  }
  const mode = sha1 || subject ? 'store' : pfx ? 'pfx' : 'none';
  return {
    mode,
    win: {
      signtoolOptions: {
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: timestamp,
        ...(sha1 ? { certificateSha1: sha1 } : {}),
        ...(subject ? { certificateSubjectName: subject } : {}),
        ...(env.HOOPS_PUBLISHER ? { publisherName: env.HOOPS_PUBLISHER } : {}),
      },
    },
  };
}

module.exports = { winSigningConfig, AZURE_KEYS, DEFAULT_TIMESTAMP };
