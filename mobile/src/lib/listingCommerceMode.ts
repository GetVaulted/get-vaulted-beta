import type { WebMarketplaceListing } from '../api/webListingsTypes';

/** Trade-only listings persist as buy_now + acceptTradeOffers with a $1 placeholder price. */
export function isTradeOnlyListing(listing: {
  buyingFormat?: string;
  acceptTradeOffers?: boolean;
  allowOffers?: boolean;
  allowLayaway?: boolean;
  price?: number;
}): boolean {
  return (
    listing.buyingFormat === 'buy_now' &&
    listing.acceptTradeOffers === true &&
    listing.allowOffers !== true &&
    listing.allowLayaway !== true &&
    listing.price === 1
  );
}

export function isTradeOnlyWebListing(listing: WebMarketplaceListing): boolean {
  return isTradeOnlyListing(listing);
}
