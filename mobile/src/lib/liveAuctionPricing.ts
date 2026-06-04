import { liveAuctionMinBidUsd } from './liveAuctionBidMath';

export type AuctionPricingInput = {
  startingBid: string;
  bidIncrement: string;
  reservePrice: string;
  buyNowPrice: string;
};

export type AuctionPricingValues = {
  startingBidUsd: number;
  bidIncrementUsd: number | null;
  reservePriceUsd: number | null;
  buyNowPriceUsd: number | null;
};

export const DEFAULT_STARTING_BID_USD = 1;

export function defaultBidIncrementUsd(startingBidUsd: number): number {
  return Math.max(1, Math.ceil(Math.max(startingBidUsd, 1) / 25));
}

export function parseUsdInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatUsdInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatUsdDisplay(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${formatUsdInput(n)}`;
}

export function auctionPricingFromItem(item: {
  startingBidUsd?: number | null;
  bidIncrementUsd?: number | null;
  reservePriceUsd?: number | null;
  priceUsd?: number | null;
}): AuctionPricingInput {
  const start = item.startingBidUsd ?? DEFAULT_STARTING_BID_USD;
  return {
    startingBid: formatUsdInput(start),
    bidIncrement: formatUsdInput(item.bidIncrementUsd ?? defaultBidIncrementUsd(start)),
    reservePrice: formatUsdInput(item.reservePriceUsd),
    buyNowPrice: formatUsdInput(item.priceUsd),
  };
}

export function validateAuctionPricing(
  input: AuctionPricingInput,
): { ok: true; values: AuctionPricingValues } | { ok: false; message: string } {
  const startingBidUsd = parseUsdInput(input.startingBid) ?? DEFAULT_STARTING_BID_USD;
  if (startingBidUsd < 1) {
    return { ok: false, message: 'Starting bid must be at least $1.' };
  }

  let bidIncrementUsd: number | null = null;
  if (input.bidIncrement.trim()) {
    bidIncrementUsd = parseUsdInput(input.bidIncrement);
    if (bidIncrementUsd == null || bidIncrementUsd < 1) {
      return { ok: false, message: 'Bid increment must be at least $1.' };
    }
    if (bidIncrementUsd > startingBidUsd) {
      return { ok: false, message: 'Bid increment should not exceed the starting bid.' };
    }
  }

  let reservePriceUsd: number | null = null;
  if (input.reservePrice.trim()) {
    reservePriceUsd = parseUsdInput(input.reservePrice);
    if (reservePriceUsd == null) {
      return { ok: false, message: 'Enter a valid reserve price or leave it blank.' };
    }
    if (reservePriceUsd < startingBidUsd) {
      return { ok: false, message: 'Reserve must be at least the starting bid.' };
    }
  }

  let buyNowPriceUsd: number | null = null;
  if (input.buyNowPrice.trim()) {
    buyNowPriceUsd = parseUsdInput(input.buyNowPrice);
    if (buyNowPriceUsd == null) {
      return { ok: false, message: 'Enter a valid buy-it-now price or leave it blank.' };
    }
    if (reservePriceUsd != null && buyNowPriceUsd < reservePriceUsd) {
      return { ok: false, message: 'Buy it now must be at least the reserve.' };
    }
  }

  return {
    ok: true,
    values: {
      startingBidUsd,
      bidIncrementUsd,
      reservePriceUsd,
      buyNowPriceUsd,
    },
  };
}

export function minNextBidForItem(item: {
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  bidIncrementUsd?: number | null;
}): number {
  const start = item.startingBidUsd ?? DEFAULT_STARTING_BID_USD;
  const high = item.currentBidUsd ?? start;
  const custom = item.bidIncrementUsd;
  if (typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
    return high + Math.max(1, Math.floor(custom));
  }
  return liveAuctionMinBidUsd({
    currentBidUsd: item.currentBidUsd ?? null,
    startingBidUsd: item.startingBidUsd,
    bidIncrementUsd: item.bidIncrementUsd,
  });
}
