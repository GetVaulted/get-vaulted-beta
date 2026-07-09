/**
 * Supabase Management API helpers for auth URL + provider toggles.
 * Uses PATCH so OAuth client secrets configured in the dashboard are not wiped.
 */
const MANAGEMENT_API = "https://api.supabase.com/v1";

export type SupabaseAuthConfig = {
  site_url?: string;
  uri_allow_list?: string;
  external_apple_enabled?: boolean;
  external_google_enabled?: boolean;
  disable_signup?: boolean;
};

export function requireSupabaseAccessToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is required. Create one at https://supabase.com/dashboard/account/tokens (scopes: auth:write).",
    );
  }
  return token;
}

export async function getSupabaseAuthConfig(projectRef: string, token: string): Promise<SupabaseAuthConfig> {
  const res = await fetch(`${MANAGEMENT_API}/projects/${encodeURIComponent(projectRef)}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET auth config failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as SupabaseAuthConfig;
}

export async function patchSupabaseAuthConfig(
  projectRef: string,
  token: string,
  patch: SupabaseAuthConfig,
): Promise<SupabaseAuthConfig> {
  const res = await fetch(`${MANAGEMENT_API}/projects/${encodeURIComponent(projectRef)}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PATCH auth config failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as SupabaseAuthConfig;
}

export function buildUriAllowList(urls: string[]): string {
  return [...new Set(urls.map((u) => u.trim()).filter(Boolean))].join(",");
}
