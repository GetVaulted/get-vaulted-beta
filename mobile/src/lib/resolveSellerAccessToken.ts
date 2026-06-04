import { getSupabase } from './supabase';

/** Prefer the current Supabase session token over a possibly stale prop. */
export async function resolveSellerAccessToken(fallback?: string): Promise<string> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.getSession();
    if (!error && data.session?.access_token?.trim()) {
      return data.session.access_token.trim();
    }
  }
  const trimmed = fallback?.trim();
  if (trimmed) return trimmed;
  throw new Error('Sign in to continue.');
}
