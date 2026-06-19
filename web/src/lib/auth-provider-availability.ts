/** Apple OAuth in Supabase (issuer https://appleid.apple.com). Client bundle needs NEXT_PUBLIC_* at build time. */
export function isAppleOAuthProviderEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_AUTH_OAUTH_APPLE_ENABLED === "true" ||
    process.env.AUTH_OAUTH_APPLE_ENABLED === "true"
  );
}

export function isGoogleOAuthProviderEnabled(): boolean {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anon) return false;
  if (process.env.AUTH_OAUTH_GOOGLE_ENABLED === "false") return false;
  return true;
}
