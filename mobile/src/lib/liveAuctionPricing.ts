export { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import { liveAuctionMinBidUsd } from './liveAuctionBidMath';
import {
  boardPackSupportsDivisions,
  boardPackTeamCount,
  buildPydVariants,
  buildPytVariants,
  buildRandomDivisionVariants,
  buildRandomTeamVariants,
  DEFAULT_LIVE_BOARD_PACK,
  type LiveBoardPackId,
  type LiveBreakVariantDraft,
} from './liveBreakPresets';
import { stripNcaaSpotVariants, withNcaaBuyableSpot, withNcaaRandomPoolSeat } from './nflNcaaSpot';
import {
  buildPlayerPickVariants,
  buildRandomPlayerVariant,
  parsePlayerSpotList,
} from '../../../shared/live-player-spot-list';

export type LiveLotSaleType =
  | 'auction'
  | 'buy_now'
  | 'pyt'
  | 'pyd'
  | 'random_pyt'
  | 'random_pyd'
  | 'pyp'
  | 'random_pyp';

export type LiveLotApiSalesFormat =
  | 'auction'
  | 'buy_now'
  | 'variant_selection'
  | 'team_break'
  | 'player_selection';

export type QuickLiveLotInput = {
  title: string;
  saleType: LiveLotSaleType;
  price: string;
  quantity: string;
  reservePrice: string;
  buyNowPrice: string;
  /** League pack for PYT / random team boards (default NFL). */
  boardPack?: LiveBoardPackId;
  /** Per-spot overrides for PYT/PYD/PYP (prices + pins). */
  spotDrafts?: LiveBreakVariantDraft[];
  /** NFL PYT: optional buyable NCAA spot (off by default). */
  includeNcaaSpot?: boolean;
  /** Multiline player paste for PYP / random PYP. */
  playerListText?: string;
};

export type QuickLiveLotValues = {
  title: string;
  saleType: LiveLotSaleType;
  quantity: number;
  startingBidUsd: number | null;
  reservePriceUsd: number | null;
  priceUsd: number | null;
  salesFormat: LiveLotApiSalesFormat;
  variantAssignmentMode?: 'pick' | 'random';
  variants?: LiveBreakVariantDraft[];
  boardPack?: LiveBoardPackId;
  teamBoardNcaa?: boolean;
  customRandomPoolLabels?: string[] | null;
};

export function isBreakLotSaleType(
  saleType: LiveLotSaleType,
): saleType is 'pyt' | 'pyd' | 'random_pyt' | 'random_pyd' | 'pyp' | 'random_pyp' {
  return (
    saleType === 'pyt' ||
    saleType === 'pyd' ||
    saleType === 'random_pyt' ||
    saleType === 'random_pyd' ||
    saleType === 'pyp' ||
    saleType === 'random_pyp'
  );
}

export function isPickBreakLotSaleType(saleType: LiveLotSaleType): saleType is 'pyt' | 'pyd' | 'pyp' {
  return saleType === 'pyt' || saleType === 'pyd' || saleType === 'pyp';
}

export function isPlayerBreakLotSaleType(saleType: LiveLotSaleType): saleType is 'pyp' | 'random_pyp' {
  return saleType === 'pyp' || saleType === 'random_pyp';
}

export function breakSpotCountForSaleType(
  saleType: LiveLotSaleType,
  boardPack: LiveBoardPackId = DEFAULT_LIVE_BOARD_PACK,
  includeNcaaSpot = false,
  playerCount = 0,
): number {
  if (saleType === 'pyp' || saleType === 'random_pyp') return playerCount;
  if (saleType === 'pyt' || saleType === 'random_pyt') {
    const n = boardPackTeamCount(boardPack);
    return includeNcaaSpot && boardPack === 'nfl' && saleType === 'pyt' ? n + 1 : n;
  }
  if (saleType === 'pyd' || saleType === 'random_pyd') return 8;
  return 0;
}

/** Keep PYT/PYD spot rows aligned with the price-per-team field until the host edits individual spots. */
export function syncPickBreakSpotDrafts(args: {
  prev: LiveBreakVariantDraft[];
  saleType: 'pyt' | 'pyd';
  basePrice: number | null;
  spotsCustomized: boolean;
  boardPack?: LiveBoardPackId;
  includeNcaaSpot?: boolean;
}): LiveBreakVariantDraft[] {
  const pack = args.boardPack ?? DEFAULT_LIVE_BOARD_PACK;
  const wantNcaa = Boolean(args.includeNcaaSpot && pack === 'nfl' && args.saleType === 'pyt');
  const expected = breakSpotCountForSaleType(args.saleType, pack, wantNcaa);
  if (args.basePrice == null) return args.prev.length === expected ? args.prev : [];
  let next: LiveBreakVariantDraft[];
  if (args.prev.length !== expected || !args.spotsCustomized) {
    next =
      args.saleType === 'pyt' ? buildPytVariants(args.basePrice, pack) : buildPydVariants(args.basePrice);
    next = wantNcaa ? withNcaaBuyableSpot(next, args.basePrice) : stripNcaaSpotVariants(next);
    if (args.spotsCustomized) {
      const byKey = new Map(args.prev.map((s) => [(s.color || s.label).toUpperCase(), s.priceUsd]));
      next = next.map((s) => ({
        ...s,
        priceUsd: byKey.get((s.color || s.label).toUpperCase()) ?? s.priceUsd,
      }));
    }
    return next;
  }
  next = wantNcaa
    ? withNcaaBuyableSpot(stripNcaaSpotVariants(args.prev), args.basePrice)
    : stripNcaaSpotVariants(args.prev);
  if (args.spotsCustomized) return next;
  return next.map((spot) => ({ ...spot, priceUsd: args.basePrice! }));
}

/** Sync PYP spot drafts from a parsed player name list + base price. */
export function syncPlayerPickSpotDrafts(args: {
  prev: LiveBreakVariantDraft[];
  names: string[];
  basePrice: number | null;
  spotsCustomized: boolean;
}): LiveBreakVariantDraft[] {
  if (args.basePrice == null || args.names.length === 0) return [];
  const priceByName = new Map(
    args.prev.map((s) => [s.label.trim().toLowerCase(), s.priceUsd] as const),
  );
  const next = buildPlayerPickVariants(
    args.names,
    args.basePrice,
    args.spotsCustomized ? priceByName : undefined,
  );
  return next;
}

export function emptyQuickLiveLotInput(saleType: LiveLotSaleType = 'auction'): QuickLiveLotInput {
  return { title: '', saleType, price: '', quantity: '', reservePrice: '', buyNowPrice: '' };
}

export function quickLiveLotFromItem(item: {
  title?: string;
  salesFormat?: 'auction' | 'buy_now' | 'variant_selection' | 'team_break' | 'player_selection';
  startingBidUsd?: number | null;
  reservePriceUsd?: number | null;
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
    reservePrice: saleType === 'auction' ? formatUsdInput(item.reservePriceUsd) : '',
    buyNowPrice: saleType === 'auction' ? formatUsdInput(item.priceUsd) : '',
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
        title,
        saleType: 'auction',
        quantity,
        startingBidUsd,
        reservePriceUsd,
        priceUsd: buyNowPriceUsd,
        salesFormat: 'auction',
      },
    };
  }

  if (input.saleType === 'pyt' || input.saleType === 'pyd') {
    const pack = input.boardPack ?? DEFAULT_LIVE_BOARD_PACK;
    if (input.saleType === 'pyd' && !boardPackSupportsDivisions(pack)) {
      return { ok: false, message: 'Divisions are only available for NFL boards.' };
    }
    const spotPrice = parseUsdInput(input.price);
    if (spotPrice == null) {
      return {
        ok: false,
        message: input.saleType === 'pyt' ? 'Enter a price per team.' : 'Enter a price per division.',
      };
    }
    const expected = breakSpotCountForSaleType(input.saleType, pack, Boolean(input.includeNcaaSpot));
    let variants =
      input.spotDrafts?.length === expected
        ? input.spotDrafts
        : input.saleType === 'pyt'
          ? buildPytVariants(spotPrice, pack)
          : buildPydVariants(spotPrice);
    if (input.saleType === 'pyt' && pack === 'nfl' && input.includeNcaaSpot) {
      variants = withNcaaBuyableSpot(stripNcaaSpotVariants(variants), spotPrice);
    } else if (input.saleType === 'pyt') {
      variants = stripNcaaSpotVariants(variants);
    }
    return {
      ok: true,
      values: {
        title,
        saleType: input.saleType,
        quantity: 1,
        startingBidUsd: null,
        reservePriceUsd: null,
        priceUsd: spotPrice,
        salesFormat: input.saleType === 'pyt' ? 'variant_selection' : 'team_break',
        variantAssignmentMode: 'pick',
        variants: variants.map((v) => ({ ...v, isHot: v.isHot === true })),
        boardPack: pack,
        teamBoardNcaa: pack === 'nfl' && Boolean(input.includeNcaaSpot),
      },
    };
  }

  if (input.saleType === 'random_pyt' || input.saleType === 'random_pyd') {
    const pack = input.boardPack ?? DEFAULT_LIVE_BOARD_PACK;
    if (input.saleType === 'random_pyd' && !boardPackSupportsDivisions(pack)) {
      return { ok: false, message: 'Divisions are only available for NFL boards.' };
    }
    const spotPrice = parseUsdInput(input.price);
    if (spotPrice == null) {
      return {
        ok: false,
        message: input.saleType === 'random_pyt' ? 'Enter a price per team.' : 'Enter a price per division.',
      };
    }
    let variants =
      input.saleType === 'random_pyt'
        ? buildRandomTeamVariants(spotPrice, pack)
        : buildRandomDivisionVariants(spotPrice);
    if (input.saleType === 'random_pyt' && pack === 'nfl' && input.includeNcaaSpot) {
      variants = withNcaaRandomPoolSeat(variants, pack);
    }
    return {
      ok: true,
      values: {
        title,
        saleType: input.saleType,
        quantity: 1,
        startingBidUsd: null,
        reservePriceUsd: null,
        priceUsd: spotPrice,
        salesFormat: input.saleType === 'random_pyt' ? 'variant_selection' : 'team_break',
        variantAssignmentMode: 'random',
        variants,
        boardPack: pack,
        teamBoardNcaa: pack === 'nfl' && Boolean(input.includeNcaaSpot),
      },
    };
  }

  if (input.saleType === 'pyp' || input.saleType === 'random_pyp') {
    const spotPrice = parseUsdInput(input.price);
    if (spotPrice == null) {
      return { ok: false, message: 'Enter a price per player.' };
    }
    const parsed = parsePlayerSpotList(input.playerListText ?? '');
    if (!parsed.ok) {
      return { ok: false, message: parsed.message };
    }
    if (input.saleType === 'pyp') {
      const priceByName = new Map(
        (input.spotDrafts ?? []).map((s) => [s.label.trim().toLowerCase(), s.priceUsd] as const),
      );
      const variants =
        input.spotDrafts?.length === parsed.names.length
          ? input.spotDrafts
          : buildPlayerPickVariants(parsed.names, spotPrice, priceByName);
      return {
        ok: true,
        values: {
          title,
          saleType: 'pyp',
          quantity: 1,
          startingBidUsd: null,
          reservePriceUsd: null,
          priceUsd: spotPrice,
          salesFormat: 'player_selection',
          variantAssignmentMode: 'pick',
          variants: variants.map((v) => ({ ...v, isHot: v.isHot === true })),
        },
      };
    }
    return {
      ok: true,
      values: {
        title,
        saleType: 'random_pyp',
        quantity: 1,
        startingBidUsd: null,
        reservePriceUsd: null,
        priceUsd: spotPrice,
        salesFormat: 'player_selection',
        variantAssignmentMode: 'random',
        variants: [buildRandomPlayerVariant(spotPrice, parsed.names.length)],
        customRandomPoolLabels: parsed.names,
      },
    };
  }

  if (priceUsd == null) {
    return { ok: false, message: 'Enter a buy-it-now price.' };
  }
  return {
    ok: true,
    values: {
      title,
      saleType: 'buy_now',
      quantity,
      startingBidUsd: null,
      reservePriceUsd: null,
      priceUsd,
      salesFormat: 'buy_now',
    },
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
