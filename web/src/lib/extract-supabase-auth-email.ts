import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

function normalizeEmail(email: string | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

/** Resolves email from Supabase Auth user (Apple often stores it only on `identities`). */
export function extractSupabaseAuthEmail(supabaseUser: SupabaseAuthUser): string | null {
  const direct = normalizeEmail(supabaseUser.email ?? undefined);
  if (direct) return direct;

  const meta = supabaseUser.user_metadata as Record<string, unknown> | undefined;
  const metaEmail =
    typeof meta?.email === "string"
      ? meta.email
      : typeof meta?.email_address === "string"
        ? meta.email_address
        : undefined;
  const fromMeta = normalizeEmail(metaEmail);
  if (fromMeta) return fromMeta;

  for (const identity of supabaseUser.identities ?? []) {
    const data = identity.identity_data as Record<string, unknown> | undefined;
    const idEmail = typeof data?.email === "string" ? data.email : undefined;
    const normalized = normalizeEmail(idEmail);
    if (normalized) return normalized;
  }

  return null;
}

/** Stable placeholder when Apple (or another IdP) omits email on first sign-in. */
export function placeholderEmailForSupabaseUser(supabaseUserId: string): string {
  const compact = supabaseUserId.replace(/-/g, "").slice(0, 32);
  return `oauth+${compact}@users.shopgetvaulted.com`;
}
