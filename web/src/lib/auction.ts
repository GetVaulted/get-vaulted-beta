/** Minimum next bid must be >= this value (strictly greater than current high). */
export function minNextBidUsd(currentHighUsd: number): number {
  const inc = Math.max(1, Math.ceil(currentHighUsd / 25));
  return currentHighUsd + inc;
}

/** Live lot snapshot fields used to compute the buyer's next bid. */
export type LiveAuctionBidContext = {
  currentBidUsd: number | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  lastHighBidderId?: string | null;
};

/** Opening price before any accepted bid (host-set start / reserve floor). */
export function liveAuctionOpeningUsd(item: LiveAuctionBidContext): number {
  const open = item.startingBidUsd ?? item.priceUsd ?? item.currentBidUsd ?? 0;
  return Number.isFinite(open) && open > 0 ? open : 0;
}

/** True once the server has recorded a high bidder on this lot. */
export function liveAuctionHasAcceptedBid(item: LiveAuctionBidContext): boolean {
  return Boolean(item.lastHighBidderId?.trim());
}

/**
 * Minimum valid bid for a live auction lot.
 * First bid equals opening price; later bids use standard increments.
 */
export function liveAuctionMinBidUsd(item: LiveAuctionBidContext): number {
  if (!liveAuctionHasAcceptedBid(item)) {
    const open = liveAuctionOpeningUsd(item);
    return open > 0 ? open : minNextBidUsd(0);
  }
  const high = item.currentBidUsd ?? liveAuctionOpeningUsd(item);
  return minNextBidUsd(high);
}

export function defaultAuctionDurationDays(days: number | null | undefined): number {
  if (days != null && Number.isFinite(days) && days > 0) return Math.floor(days);
  return 7;
}

export function computeAuctionEndsAt(from: Date, durationDays: number | null | undefined): Date {
  const d = defaultAuctionDurationDays(durationDays);
  return new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
}
