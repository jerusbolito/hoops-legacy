import { useState, type FormEvent, type ReactNode } from 'react';
import { requestPasswordReset, resolve, setNewPassword, signIn, signOut, signUp, syncNow, useAccount } from '../../sync/account';
import type { ConflictChoice } from '../../sync/engine';
import { cloudConfigured } from '../../sync/supabase';
import { Button } from './ui';

const input = 'w-full rounded-lg border border-court-600 bg-court-800 px-3 py-2 text-sm text-ink-100 outline-none focus:border-hoop-500';

function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-court-700 bg-court-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

type Mode = 'in' | 'up' | 'forgot';

function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'up' && password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const r = await requestPasswordReset(email.trim());
        if (!r.ok) setError(r.error);
        else setNotice('If that email has an account, a reset link is on its way. Open it in a browser to choose a new password, then sign in here.');
      } else if (mode === 'up') {
        const r = await signUp(email.trim(), password);
        if (!r.ok) setError(r.error);
        else if (r.needsConfirmation) setNotice('Almost there: we sent a confirmation link to your email. Open it, then come back and sign in.');
        else onClose();
      } else {
        const r = await signIn(email.trim(), password);
        if (!r.ok) setError(r.error);
        else onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Reset password';
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-400">Keep your careers in the cloud and pick them up on any device. Your saves stay on this device too, and the game works without an account.</p>
      <form onSubmit={go} className="space-y-3">
        <label className="block text-xs text-ink-400">
          Email
          <input className={`${input} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label className="block text-xs text-ink-400">
            Password {mode === 'up' && <span className="text-ink-500">(8 or more characters)</span>}
            <input className={`${input} mt-1`} type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={mode === 'up' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
        {notice && <p role="status" className="text-sm text-win">{notice}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-ink-400">
        {mode === 'in' ? (
          <>
            <button className="underline hover:text-ink-200" onClick={() => setMode('up')}>Create an account</button>
            <button className="underline hover:text-ink-200" onClick={() => setMode('forgot')}>Forgot password?</button>
          </>
        ) : (
          <button className="underline hover:text-ink-200" onClick={() => setMode('in')}>Back to sign in</button>
        )}
      </div>
    </Modal>
  );
}

function RecoveryDialog() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy(true);
    const r = await setNewPassword(password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  };
  return (
    <Modal title="Choose a new password">
      <form onSubmit={go} className="space-y-3">
        <label className="block text-xs text-ink-400">
          New password (8 or more characters)
          <input className={`${input} mt-1`} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </Modal>
  );
}

function ConflictDialog() {
  const conflicts = useAccount((s) => s.conflicts);
  const [busy, setBusy] = useState<string | null>(null);
  if (conflicts.length === 0) return null;
  const c = conflicts[0];
  const pick = async (choice: ConflictChoice) => {
    setBusy(c.id);
    await resolve(c.id, choice);
    setBusy(null);
  };
  return (
    <Modal title="Two versions of this career">
      <p className="text-sm text-ink-300">
        <strong className="text-ink-100">{c.name}</strong> was changed on this device and somewhere else since they last matched. Which one do you want?
      </p>
      <div className="mt-3 space-y-2 text-xs">
        <div className="rounded-lg border border-court-700 bg-court-850 p-3">
          <div className="font-semibold text-ink-100">This device</div>
          <div className="text-ink-400">{c.localSubtitle}</div>
          <div className="text-ink-500">Saved {new Date(c.localUpdated).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-court-700 bg-court-850 p-3">
          <div className="font-semibold text-ink-100">Cloud</div>
          <div className="text-ink-400">{c.remote.subtitle || 'Saved from another device'}</div>
          {c.remote.clientUpdated > 0 && <div className="text-ink-500">Saved {new Date(c.remote.clientUpdated).toLocaleString()}</div>}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button disabled={!!busy} onClick={() => pick('both')}>Keep both (recommended)</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => pick('device')}>Keep this device's version</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => pick('cloud')}>Keep the cloud version</Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">"Keep both" saves this device's version as a separate career, so nothing is lost. The other two choices replace one version with the other.</p>
      {conflicts.length > 1 && <p className="mt-2 text-[11px] text-ink-500">{conflicts.length - 1} more to go after this one.</p>}
    </Modal>
  );
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Sign-in entry and sync status for the title screen. Renders nothing in a build without cloud settings. */
export function AccountBar() {
  const { ready, user, status, lastSyncedAt, error, needsAppUpdate, recovering } = useAccount();
  const [showAuth, setShowAuth] = useState(false);
  if (!cloudConfigured || !ready) return null;

  return (
    <>
      {showAuth && !user && <AuthDialog onClose={() => setShowAuth(false)} />}
      {recovering && <RecoveryDialog />}
      <ConflictDialog />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-court-700 bg-court-850/80 px-4 py-3 text-sm">
        {user ? (
          <>
            <div className="min-w-0">
              <div className="truncate font-semibold">☁ {user.email}</div>
              <div className="text-xs text-ink-400" role="status">
                {status === 'syncing' ? 'Syncing…' : status === 'error' ? <span className="text-loss">Sync problem: {error}</span> : lastSyncedAt ? `Synced ${ago(lastSyncedAt)}` : 'Signed in'}
                {needsAppUpdate > 0 && ` · ${needsAppUpdate} save${needsAppUpdate > 1 ? 's' : ''} need a newer version of the app`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={status === 'syncing'} onClick={() => void syncNow()}>Sync now</Button>
              <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <div className="font-semibold">Save your careers to the cloud</div>
              <div className="text-xs text-ink-400">Sign in to play the same careers on any device. Optional.</div>
            </div>
            <Button variant="outline" onClick={() => setShowAuth(true)}>Sign in or sign up</Button>
          </>
        )}
      </div>
    </>
  );
}
