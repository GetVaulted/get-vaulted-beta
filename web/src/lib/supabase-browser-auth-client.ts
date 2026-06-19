import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Browser Supabase client for OAuth (PKCE). Uses cookie storage via @supabase/ssr so the
 * code verifier survives the Google redirect in Next.js (localStorage alone loses it).
 */
export function getSupabaseBrowserAuthClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createBrowserClient(url, key);
  return cached;
}
