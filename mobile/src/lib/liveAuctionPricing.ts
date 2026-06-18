import { liveAuctionMinBidUsd } from './liveAuctionBidMath';

export type LiveLotSaleType = 'auction' | 'buy_now';

export type QuickLiveLotInput = {
  title: string;
  saleType: LiveLotSaleType;
  price: string;
  quantity: string;
};

export type QuickLiveLotValues = {
  title: string;
  saleType: LiveLotSaleType;
  quantity: number;
  startingBidUsd: number | null;
  priceUsd: number | null;
};

export function emptyQuickLiveLotInput(saleType: LiveLotSaleType = 'auction'): QuickLiveLotInput {
  return { title: '', saleType, price: '', quantity: '' };
}

export function quickLiveLotFromItem(item: {
  title?: string;
  salesFormat?: 'auction' | 'buy_now' | 'variant_selection' | 'team_break';
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  quantity?: number | null;
  remainingQuantity?: number | null;
  quantityInitial?: number | null;
}): QuickLiveLotInput {
  const saleType: LiveLotSaleType = item.salesFormat === 'buy_now' ? 'buy_now' : 'auction';
  const quantity = String(queueItemQuantity(item));
  const price =
    saleType === 'buy_now'
      ? formatUsdInput(item.priceUsd)
      : formatUsdInput(item.startingBidUsd ?? DEFAULT_STARTING_BID_USD);
  return {
    title: item.title?.trim() ?? '',
    saleType,
    price,
    quantity,
  };
}

export function validateQuickLiveLot(
  input: QuickLiveLotInput,
): { ok: true; values: QuickLiveLotValues } | { ok: false; message: string } {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, message: 'Enter a product title.' };
  }

  const quantityParsed = parseQuantityInput(input.quantity);
  if (input.quantity.trim() && quantityParsed == null) {
    return { ok: false, message: 'Quantity must be at least 1.' };
  }
  const quantity = quantityParsed ?? DEFAULT_QUEUE_QUANTITY;

  const priceUsd = parseUsdInput(input.price);
  if (input.saleType === 'auction') {
    const startingBidUsd = priceUsd ?? DEFAULT_STARTING_BID_USD;
    if (startingBidUsd < 1) {
      return { ok: false, message: 'Starting bid must be at least $1.' };
    }
    return {
      ok: true,
      values: { title, saleType: 'auction', quantity, startingBidUsd, priceUsd: null },
    };
  }

  if (priceUsd == null) {
    return { ok: false, message: 'Enter a buy-it-now price.' };
  }
  return {
    ok: true,
    values: { title, saleType: 'buy_now', quantity, startingBidUsd: null, priceUsd },
  };
}

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
