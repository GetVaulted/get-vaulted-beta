import { liveAuctionMinBidUsd } from './liveAuctionBidMath';

export type AuctionPricingInput = {
  quantity: string;
  startingBid: string;
  reservePrice: string;
  buyNowPrice: string;
};

export type AuctionPricingValues = {
  quantity: number;
  startingBidUsd: number;
  reservePriceUsd: number | null;
  buyNowPriceUsd: number | null;
};

export const DEFAULT_STARTING_BID_USD = 1;
export const DEFAULT_QUEUE_QUANTITY = 1;
export const MAX_QUEUE_QUANTITY = 512;

export function parseUsdInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseQuantityInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_QUEUE_QUANTITY, Math.floor(n));
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

export function queueItemQuantity(item: {
  quantity?: number | null;
  remainingQuantity?: number | null;
  quantityInitial?: number | null;
}): number {
  const q = item.quantity ?? item.remainingQuantity ?? item.quantityInitial;
  if (typeof q === 'number' && Number.isFinite(q) && q >= 1) return Math.floor(q);
  return DEFAULT_QUEUE_QUANTITY;
}

export function auctionPricingFromItem(item: {
  quantity?: number | null;
  remainingQuantity?: number | null;
  quantityInitial?: number | null;
  startingBidUsd?: number | null;
  reservePriceUsd?: number | null;
  priceUsd?: number | null;
}): AuctionPricingInput {
  return {
    quantity: String(queueItemQuantity(item)),
    startingBid: formatUsdInput(item.startingBidUsd ?? DEFAULT_STARTING_BID_USD),
    reservePrice: formatUsdInput(item.reservePriceUsd),
    buyNowPrice: formatUsdInput(item.priceUsd),
  };
}

export function validateAuctionPricing(
  input: AuctionPricingInput,
): { ok: true; values: AuctionPricingValues } | { ok: false; message: string } {
  const quantityParsed = parseQuantityInput(input.quantity);
  if (input.quantity.trim() && quantityParsed == null) {
    return { ok: false, message: 'Quantity must be at least 1.' };
  }
  const quantity = quantityParsed ?? DEFAULT_QUEUE_QUANTITY;

  const startingBidUsd = parseUsdInput(input.startingBid) ?? DEFAULT_STARTING_BID_USD;
  if (startingBidUsd < 1) {
    return { ok: false, message: 'Starting bid must be at least $1.' };
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
      quantity,
      startingBidUsd,
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
  return liveAuctionMinBidUsd({
    currentBidUsd: item.currentBidUsd ?? null,
    startingBidUsd: item.startingBidUsd,
    bidIncrementUsd: item.bidIncrementUsd,
  });
}
