/** Public storefront path for a seller username (case-sensitive match to `User.username`). */
export function sellerProfilePath(username: string): string {
  return `/seller/${encodeURIComponent(username)}`;
}
