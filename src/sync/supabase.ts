import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False when the build has no Supabase settings: the game then runs exactly as before, with no account UI. */
export const cloudConfigured = Boolean(url && key);

/**
 * Where links in account emails (confirm your address, reset your password) lead. This is always the website,
 * never the page the app is running on: the desktop app is served from a local address that nobody else can open.
 */
export const WEB_URL = 'https://comeuphoops.com';

let client: SupabaseClient | null = null;

/** The one shared client. The publishable key is meant to be public; row-level security guards the data. */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  return (client ??= createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}
