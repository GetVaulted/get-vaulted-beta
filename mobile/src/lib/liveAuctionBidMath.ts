/** Mirrors web `liveAuctionMinBidUsd` — keep in sync with web/src/lib/auction.ts */

export type LiveAuctionBidContext = {
  currentBidUsd: number | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  lastHighBidderId?: string | null;
};

function minNextBidUsd(currentHighUsd: number): number {
  const inc = Math.max(1, Math.ceil(currentHighUsd / 25));
  return currentHighUsd + inc;
}

export function liveAuctionOpeningUsd(item: LiveAuctionBidContext): number {
  const open = item.startingBidUsd ?? item.priceUsd ?? item.currentBidUsd ?? 0;
  return Number.isFinite(open) && open > 0 ? open : 0;
}

export function liveAuctionHasAcceptedBid(item: LiveAuctionBidContext): boolean {
  return Boolean(item.lastHighBidderId?.trim());
}

export function liveAuctionMinBidUsd(item: LiveAuctionBidContext): number {
  if (!liveAuctionHasAcceptedBid(item)) {
    const open = liveAuctionOpeningUsd(item);
    return open > 0 ? open : minNextBidUsd(0);
  }
  const high = item.currentBidUsd ?? liveAuctionOpeningUsd(item);
  return minNextBidUsd(high);
}
