/** Build marketplace browse URL with optional search query. */
export function marketplaceSearchHref(query: string): string {
  const q = query.trim();
  if (!q) return "/marketplace";
  return `/marketplace?q=${encodeURIComponent(q)}`;
}
