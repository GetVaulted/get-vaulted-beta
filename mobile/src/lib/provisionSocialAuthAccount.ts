import { fetchWebApiAuthed } from './fetchWebApiAuthed';
import { getSupabase } from './supabase';

/**
 * Ensures a Prisma User row exists after OAuth (Google/Apple).
 * Mobile has no NextAuth cookie bridge — first authenticated API call creates the row.
 */
export async function provisionSocialAuthAccount(): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb?.auth.getSession() ?? { data: { session: null }, error: null };
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) return;

  const res = await fetchWebApiAuthed('/api/account/identity', token);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not finish setting up your account. Try again.');
  }
}
