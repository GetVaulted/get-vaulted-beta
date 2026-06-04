/** Structured logs for Create Vault Event → Seller Host Room (command center). */
export function logVaultCommandCenter(
  step: string,
  data?: Record<string, unknown>,
): void {
  console.info('[vault-command-center]', step, data ? JSON.stringify(data) : '');
}

/** Supabase JWT `sub` for correlating mobile session with server seller id (no secrets logged). */
export function supabaseJwtSub(accessToken: string | undefined): string | null {
  if (!accessToken?.trim()) return null;
  const parts = accessToken.trim().split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad)) as { sub?: string };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}
