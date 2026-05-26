/** Mirrors web `liveAuctionMinBidUsd` — keep in sync with web/src/lib/auction.ts */

import {
  liveAuctionHasAcceptedBid,
  liveAuctionOpeningBidUsd,
} from './liveAuctionOverlayPrice';

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
  return liveAuctionOpeningBidUsd(item);
}

export { liveAuctionHasAcceptedBid };

export function liveAuctionMinBidUsd(item: LiveAuctionBidContext): number {
  if (!liveAuctionHasAcceptedBid(item)) {
    const open = liveAuctionOpeningUsd(item);
    return open > 0 ? open : minNextBidUsd(0);
  }
  const high = item.currentBidUsd ?? liveAuctionOpeningUsd(item);
  return minNextBidUsd(high);
}
