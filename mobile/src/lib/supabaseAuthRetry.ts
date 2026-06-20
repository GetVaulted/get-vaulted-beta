import type { AuthError } from '@supabase/supabase-js';
import { ensureSupabaseReady, getSupabase, resetSupabaseBootstrap } from './supabase';

/**
 * Re-bootstrap Supabase from the live site config when EAS-baked anon keys are stale
 * (Supabase returns "Invalid API key" on sign-in).
 */
export async function runSupabaseAuthOp<T extends { error: AuthError | null }>(
  buildOp: () => T | Promise<T>,
): Promise<T> {
  let result = await buildOp();
  if (result.error?.message === 'Invalid API key') {
    resetSupabaseBootstrap();
    await ensureSupabaseReady();
    if (!getSupabase()) {
      return result;
    }
    result = await buildOp();
  }
  return result;
}
