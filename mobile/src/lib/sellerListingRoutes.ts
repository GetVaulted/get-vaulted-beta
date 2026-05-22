/** Mirrors web `sellerListingHref` — seller Vault Studio management (not buyer PDP). */
export function sellerListingManagementPath(listingId: string): string {
  return `/seller/listings/${encodeURIComponent(listingId)}`;
}

/** Public buyer listing detail (marketplace PDP). */
export function publicListingPath(listingId: string): string {
  return `/listing/${encodeURIComponent(listingId)}`;
}
