/** Extract Supabase project ref from HTTPS or Postgres URLs (no secrets). */
export function supabaseProjectRefFromUrl(url: string): string | null {
  const u = url.trim();
  const hostMatch = u.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (hostMatch?.[1]) return hostMatch[1];
  const dbHost = u.match(/db\.([a-z0-9]+)\.supabase\.co/i);
  if (dbHost?.[1]) return dbHost[1];
  return null;
}
