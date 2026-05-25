import { createClient } from "@supabase/supabase-js";

/** Service-role Supabase client for account admin (deletion). */
export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) return null;
  return createClient(url.trim(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function revokeSupabaseAuthUser(supabaseUserId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, error: "Auth admin not configured." };
  }
  const { error } = await admin.auth.admin.deleteUser(supabaseUserId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
