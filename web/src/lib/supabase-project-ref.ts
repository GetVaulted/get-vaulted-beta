/** Extract Supabase project ref from Postgres URI or Supabase HTTPS URL (no secrets). */
export function supabaseProjectRefFromUrl(url: string): string | null {
  const u = url.trim();
  const hostMatch = u.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (hostMatch?.[1]) return hostMatch[1];
  const dbHost = u.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  if (dbHost?.[1]) return dbHost[1];
  const pooler = u.match(/postgres\.([a-z0-9]+)(?::|@)/i);
  if (pooler?.[1]) return pooler[1];
  return null;
}
