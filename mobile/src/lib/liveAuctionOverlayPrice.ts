import { formatAuctionMoneyUsd } from './liveAuctionWinnerDisplay';

export type LiveItemCommerceMode = 'auction' | 'buy_now';

export type LiveItemOverlayPriceKind = 'opening' | 'current' | 'sold' | 'asking';

export type LiveItemOverlayPrice = {
  kind: LiveItemOverlayPriceKind;
  label: string;
  amountUsd: number;
  amountFormatted: string;
};

export function liveAuctionOpeningBidUsd(args: { startingBidUsd?: number | null }): number {
  const s = args.startingBidUsd;
  if (typeof s === 'number' && Number.isFinite(s) && s > 0) return s;
  return 1;
}

export function liveAuctionHasAcceptedBid(args: {
  lastHighBidderId?: string | null;
  lastHighBidderUsername?: string | null;
}): boolean {
  return Boolean(args.lastHighBidderId?.trim() || args.lastHighBidderUsername?.trim());
}

export function resolveLiveItemOverlayPrice(args: {
  commerceMode: LiveItemCommerceMode;
  status?: string;
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  lastHighBidderId?: string | null;
  lastHighBidderUsername?: string | null;
}): LiveItemOverlayPrice {
  if (args.commerceMode === 'buy_now') {
    const ask = args.priceUsd ?? 0;
    const amountUsd = typeof ask === 'number' && Number.isFinite(ask) && ask > 0 ? ask : 0;
    return {
      kind: 'asking',
      label: 'Asking',
      amountUsd,
      amountFormatted: formatAuctionMoneyUsd(amountUsd),
    };
  }

  const opening = liveAuctionOpeningBidUsd(args);

  if (args.status === 'sold') {
    const soldAmount =
      typeof args.currentBidUsd === 'number' && Number.isFinite(args.currentBidUsd) && args.currentBidUsd > 0
        ? args.currentBidUsd
        : opening;
    return {
      kind: 'sold',
      label: 'Sold',
      amountUsd: soldAmount,
      amountFormatted: formatAuctionMoneyUsd(soldAmount),
    };
  }

  if (liveAuctionHasAcceptedBid(args)) {
    const cur =
      typeof args.currentBidUsd === 'number' && Number.isFinite(args.currentBidUsd) && args.currentBidUsd > 0
        ? args.currentBidUsd
        : opening;
    return {
      kind: 'current',
      label: 'Current bid',
      amountUsd: cur,
      amountFormatted: formatAuctionMoneyUsd(cur),
    };
  }

  return {
    kind: 'opening',
    label: 'Opening bid',
    amountUsd: opening,
    amountFormatted: formatAuctionMoneyUsd(opening),
  };
}

export function liveAuctionDisplayBidUsd(args: {
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  lastHighBidderId?: string | null;
  lastHighBidderUsername?: string | null;
}): number {
  const opening = liveAuctionOpeningBidUsd(args);
  if (!liveAuctionHasAcceptedBid(args)) return opening;
  const cur = args.currentBidUsd;
  if (typeof cur === 'number' && Number.isFinite(cur) && cur > 0) return cur;
  return opening;
}
