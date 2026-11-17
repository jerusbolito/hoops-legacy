import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { onLocalChange } from '../state/persistence';
import { supabaseCloud } from './cloud';
import { resolveConflict, syncAll, type Conflict, type ConflictChoice } from './engine';
import { cloudConfigured, supabase, WEB_URL } from './supabase';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AccountState {
  /** Auth has been checked (the stored session loaded), so the UI knows whether to show sign-in. */
  ready: boolean;
  user: { id: string; email: string } | null;
  /** The player followed a password-reset link and must choose a new password. */
  recovering: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  conflicts: Conflict[];
  needsAppUpdate: number;
}

export const useAccount = create<AccountState>(() => ({
  ready: !cloudConfigured,
  user: null,
  recovering: false,
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  conflicts: [],
  needsAppUpdate: 0,
}));

const set = useAccount.setState;

const friendly = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password do not match.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: we sent you a link.';
  if (m.includes('already registered')) return 'That email already has an account. Try signing in.';
  if (m.includes('password should be')) return 'Choose a password of at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the server. Check your connection.';
  return message;
};

/* ── syncing ── */

let timer: ReturnType<typeof setTimeout> | undefined;

export async function syncNow(): Promise<void> {
  const sb = supabase();
  const user = useAccount.getState().user;
  if (!sb || !user) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  set({ status: 'syncing', error: null });
  try {
    const r = await syncAll(supabaseCloud(sb), user.id);
    set({ status: 'synced', lastSyncedAt: Date.now(), conflicts: r.conflicts, needsAppUpdate: r.needsAppUpdate });
  } catch (e) {
    set({ status: 'error', error: friendly((e as Error).message) });
  }
}

/** Waits a few seconds after the last change so a burst of autosaves becomes one upload. */
function scheduleSync(delayMs = 8000) {
  if (!useAccount.getState().user) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

export async function resolve(id: string, choice: ConflictChoice): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  try {
    await resolveConflict(supabaseCloud(sb), id, choice);
  } catch (e) {
    set({ error: friendly((e as Error).message) });
  }
  await syncNow();
}

/* ── auth ── */

const toUser = (s: Session | null) => (s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null);

let started = false;

/** Call once at startup. Restores the session, then keeps sync running in the background. */
export function startAccount(): void {
  const sb = supabase();
  if (!sb || started) return;
  started = true;

  sb.auth.onAuthStateChange((event, session) => {
    const user = toUser(session);
    set({ user, ready: true, recovering: event === 'PASSWORD_RECOVERY' ? true : useAccount.getState().recovering });
    if (!user) set({ status: 'idle', conflicts: [], error: null, lastSyncedAt: null });
    // a fresh sign-in (or a restored session at startup) syncs straight away
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(() => void syncNow(), 0);
  });

  onLocalChange(() => scheduleSync());
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void syncNow(); // leaving the tab or app: get the latest save up
    });
    window.addEventListener('online', () => void syncNow());
  }
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow(); // pick up changes made on another device
  }, 5 * 60 * 1000);
}

type Outcome = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

export async function signUp(email: string, password: string): Promise<Outcome> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Accounts are not available in this build.' };
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: WEB_URL } });
  if (error) return { ok: false, error: friendly(error.message) };
  // with email confirmation on there is no session yet; an already-registered address comes back with no identities
  if (data.user && data.user.identities?.length === 0) return { ok: false, error: friendly('already registered') };
  return { ok: true, needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<Outcome> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function signOut(): Promise<void> {
  clearTimeout(timer);
  await supabase()?.auth.signOut(); // saves stay on this device
}

export async function requestPasswordReset(email: string): Promise<Outcome> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: WEB_URL });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function setNewPassword(password: string): Promise<Outcome> {
  const sb = supabase();
  if (!sb) return { ok: false, error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, error: friendly(error.message) };
  set({ recovering: false });
  return { ok: true };
}
