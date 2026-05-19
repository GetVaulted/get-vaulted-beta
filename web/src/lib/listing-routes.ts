/** Public buyer-facing listing detail URL. */
export function publicListingHref(listingId: string): string {
  return `/listing/${encodeURIComponent(listingId)}`;
}

/** Seller Vault Studio management console for a listing. */
export function sellerListingHref(listingId: string): string {
  return `/seller/listings/${encodeURIComponent(listingId)}`;
}

/** Legacy marketplace slug URLs (redirect to public listing route). */
export function legacyMarketplaceListingHref(listingId: string): string {
  return `/marketplace/${encodeURIComponent(listingId)}`;
}
