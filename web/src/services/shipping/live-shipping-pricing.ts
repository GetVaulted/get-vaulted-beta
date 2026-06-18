import type { ShippingCategory } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";

export type LiveShippingTier = { maxWeightOz: number; costCents: number };
/** Bundled live shipping session key (excludes `shipAlone` per-order sessions). */
export const LIVE_BUNDLED_SHIPPING_DESTINATION_KEY = "__default__";
const DEFAULT_DESTINATION_KEY = LIVE_BUNDLED_SHIPPING_DESTINATION_KEY;

const FALLBACK_TIERS: LiveShippingTier[] = [
  { maxWeightOz: 4, costCents: 399 },
  { maxWeightOz: 8, costCents: 499 },
  { maxWeightOz: 16, costCents: 599 },
  { maxWeightOz: 32, costCents: 799 },
  { maxWeightOz: 48, costCents: 999 },
  { maxWeightOz: Number.POSITIVE_INFINITY, costCents: 1199 },
];

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function defaultWeightsForCategory(category: ShippingCategory): { base: number; incremental: number } {
  if (category === "slab") {
    return {
      base: parsePositiveNumber(process.env.DEFAULT_SLAB_BASE_WEIGHT_OZ, 8),
      incremental: parsePositiveNumber(process.env.DEFAULT_SLAB_INCREMENTAL_WEIGHT_OZ, 3),
    };
  }
  if (category === "small_collectible") {
    return {
      base: parsePositiveNumber(process.env.DEFAULT_SMALL_COLLECTIBLE_BASE_WEIGHT_OZ, 6),
      incremental: parsePositiveNumber(process.env.DEFAULT_SMALL_COLLECTIBLE_INCREMENTAL_WEIGHT_OZ, 2),
    };
  }
  return {
    base: parsePositiveNumber(process.env.DEFAULT_RAW_CARD_BASE_WEIGHT_OZ, 4),
    incremental: parsePositiveNumber(process.env.DEFAULT_RAW_CARD_INCREMENTAL_WEIGHT_OZ, 1),
  };
}

function getLiveShippingCapCents(defaultCap: number | null = null): number {
  if (defaultCap != null && Number.isFinite(defaultCap) && defaultCap >= 0) return Math.floor(defaultCap);
  const fromEnv = Number(process.env.LIVE_SHIPPING_CAP_CENTS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  return 1199;
}

function parseTiersFromEnv(): LiveShippingTier[] | null {
  const raw = process.env.LIVE_SHIPPING_TIERS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const tiers = parsed
      .map((v) => ({
        maxWeightOz: Number((v as { maxWeightOz?: unknown }).maxWeightOz),
        costCents: Number((v as { costCents?: unknown }).costCents),
      }))
      .filter((v) => Number.isFinite(v.maxWeightOz) && v.maxWeightOz > 0 && Number.isFinite(v.costCents) && v.costCents >= 0)
      .sort((a, b) => a.maxWeightOz - b.maxWeightOz);
    return tiers.length > 0 ? tiers : null;
  } catch {
    return null;
  }
}

function effectiveTiers(): LiveShippingTier[] {
  return parseTiersFromEnv() ?? FALLBACK_TIERS;
}

export function calculateLivePricingWeight(items: Array<{ appliedWeightOz: number }>): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.appliedWeightOz) ? item.appliedWeightOz : 0), 0);
}

export function calculateLiveShippingCost(weightOz: number, capCents?: number | null): number {
  if (!Number.isFinite(weightOz) || weightOz <= 0) return 0;
  const tiers = effectiveTiers();
  const row = tiers.find((tier) => weightOz <= tier.maxWeightOz) ?? tiers[tiers.length - 1];
  const computed = row?.costCents ?? 0;
  const cap = getLiveShippingCapCents(capCents ?? null);
  return Math.min(computed, cap);
}

/** Buyer-facing label for the tier band that contains `pricingWeightOz` (e.g. `"5–8 oz tier"`). */
export function liveShippingTierLabelForPricingWeightOz(pricingWeightOz: number): string | null {
  if (!Number.isFinite(pricingWeightOz) || pricingWeightOz <= 0) return null;
  const tiers = effectiveTiers();
  const w = pricingWeightOz;
  const idx = tiers.findIndex((t) => w <= t.maxWeightOz);
  const i = idx === -1 ? tiers.length - 1 : idx;
  const prevMax = i === 0 ? 0 : tiers[i - 1]!.maxWeightOz;
  const hi = tiers[i]!.maxWeightOz;
  const lo = i === 0 ? 1 : Math.floor(prevMax) + 1;
  if (!Number.isFinite(hi) || hi === Number.POSITIVE_INFINITY) {
    return `${lo}+ oz tier`;
  }
  return `${lo}–${Math.floor(hi)} oz tier`;
}

/**
 * Extra shipping cents if one more bundled item used `incrementalWeightOz` (UX preview; mirrors session recalc math).
 */
export function computeBundledNextItemShippingDeltaCents(args: {
  currentPricingWeightOz: number;
  currentShippingCostCents: number;
  capReached: boolean;
  incrementalWeightOz: number;
  listingCapCents?: number | null;
}): number | null {
  if (args.capReached) return 0;
  if (!Number.isFinite(args.incrementalWeightOz) || args.incrementalWeightOz <= 0) return null;
  const newWeight = args.currentPricingWeightOz + args.incrementalWeightOz;
  const newCost = calculateLiveShippingCost(newWeight, args.listingCapCents ?? null);
  return Math.max(0, newCost - args.currentShippingCostCents);
}

export async function findOrCreateLiveShippingSessionTx(
  tx: TransactionClient,
  args: { buyerId: string; sellerId: string; liveShowId: string; destinationAddressId?: string | null },
) {
  const key = {
    buyerId: args.buyerId,
    sellerId: args.sellerId,
    liveShowId: args.liveShowId,
    destinationAddressId: args.destinationAddressId ?? DEFAULT_DESTINATION_KEY,
  };
  return tx.liveShippingSession.upsert({
    where: {
      buyerId_sellerId_liveShowId_destinationAddressId: key,
    },
    update: {},
    create: key,
  });
}

export async function findOrCreateLiveShippingSession(args: {
  buyerId: string;
  sellerId: string;
  liveShowId: string;
  destinationAddressId?: string | null;
}) {
  return prisma.$transaction((tx) => findOrCreateLiveShippingSessionTx(tx, args));
}

export type AddOrderToLiveShippingSessionOpts = {
  /** When set, attach to this show’s queue item (avoids picking the wrong room if multiple). */
  liveShowId?: string | null;
  /** When set with `liveShowId`, resolve the tile row directly (break PYT rounds use ephemeral listings). */
  liveRoomItemId?: string | null;
};

/**
 * Upper bound for one buyer’s first item in a live session (used for escrow threshold before order exists).
 */
export async function estimateFirstItemLiveShippingCentsForListingTx(
  tx: TransactionClient,
  listingId: string,
): Promise<number> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: {
      shippingCategory: true,
      shippingBaseWeightOz: true,
      shippingIncrementalWeightOz: true,
      shippingPriceCapCents: true,
    },
  });
  if (!listing) return 0;
  const defaults = defaultWeightsForCategory(listing.shippingCategory);
  const baseWeightOz =
    Number.isFinite(listing.shippingBaseWeightOz) && listing.shippingBaseWeightOz > 0
      ? listing.shippingBaseWeightOz
      : defaults.base;
  return calculateLiveShippingCost(baseWeightOz, listing.shippingPriceCapCents ?? null);
}

export async function addOrderToLiveShippingSessionTx(
  tx: TransactionClient,
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<{
  sessionId: string;
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
}> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        listingId: true,
      },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const existingItem = await tx.liveShippingSessionItem.findUnique({
      where: { orderId: order.id },
      select: { sessionId: true },
    });
    if (existingItem) {
      const summary = await getLiveShippingSessionSummaryTx(tx, existingItem.sessionId);
      if (!summary) throw new Error("LIVE_SHIPPING_SESSION_NOT_FOUND");
      return summary;
    }

    const listing = await tx.listing.findUnique({
      where: { id: order.listingId },
      select: {
        shippingCategory: true,
        shippingBaseWeightOz: true,
        shippingIncrementalWeightOz: true,
        shippingPriceCapCents: true,
        shipAlone: true,
      },
    });
    if (!listing) throw new Error("LISTING_NOT_FOUND");

    const liveItem =
      opts?.liveShowId && opts?.liveRoomItemId
        ? await tx.liveRoomItem.findFirst({
            where: {
              id: opts.liveRoomItemId,
              liveRoomId: opts.liveShowId,
              liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "break", "sale"] } },
            },
            select: { liveRoomId: true },
          })
        : opts?.liveShowId
          ? await tx.liveRoomItem.findFirst({
              where: {
                listingId: order.listingId,
                liveRoomId: opts.liveShowId,
                liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "sale"] } },
              },
              select: { liveRoomId: true },
            })
          : await tx.liveRoomItem.findFirst({
              where: {
                listingId: order.listingId,
                liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "sale"] } },
              },
              select: { liveRoomId: true },
              orderBy: { updatedAt: "desc" },
            });
    if (!liveItem) throw new Error("LIVE_SHIPPING_NOT_APPLICABLE");

    const defaults = defaultWeightsForCategory(listing.shippingCategory);
    const baseWeightOz = Number.isFinite(listing.shippingBaseWeightOz) && listing.shippingBaseWeightOz > 0 ? listing.shippingBaseWeightOz : defaults.base;
    const incrementalWeightOz =
      Number.isFinite(listing.shippingIncrementalWeightOz) && listing.shippingIncrementalWeightOz > 0
        ? listing.shippingIncrementalWeightOz
        : defaults.incremental;

    const shipAloneAddressKey = listing.shipAlone ? `ship-alone:${order.id}` : null;
    const session = await findOrCreateLiveShippingSessionTx(tx, {
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      liveShowId: liveItem.liveRoomId,
      destinationAddressId: shipAloneAddressKey,
    });

    const itemCount = await tx.liveShippingSessionItem.count({ where: { sessionId: session.id } });
    const appliedWeightOz = itemCount === 0 ? baseWeightOz : incrementalWeightOz;

    await tx.liveShippingSessionItem.create({
      data: {
        sessionId: session.id,
        orderId: order.id,
        listingId: order.listingId,
        baseWeightOz,
        incrementalWeightOz,
        appliedWeightOz,
      },
    });

    const summary = await recalcLiveShippingSessionTx(tx, session.id, listing.shippingPriceCapCents ?? null);

    await tx.order.update({
      where: { id: order.id },
      data: {
        liveShippingSessionId: session.id,
        shippingPriceUsd: 0,
      },
    });

    return summary;
}

export async function addOrderToLiveShippingSession(
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<{
  sessionId: string;
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
}> {
  return prisma.$transaction(async (tx) => addOrderToLiveShippingSessionTx(tx, orderId, opts));
}

async function recalcLiveShippingSessionTx(tx: TransactionClient, sessionId: string, capCents?: number | null) {
  const items = await tx.liveShippingSessionItem.findMany({
    where: { sessionId },
    select: { appliedWeightOz: true },
  });
  const pricingWeightOz = calculateLivePricingWeight(items);
  const shippingCostCents = calculateLiveShippingCost(pricingWeightOz, capCents ?? null);
  const cap = getLiveShippingCapCents(capCents ?? null);
  const capReached = shippingCostCents >= cap;

  await tx.liveShippingSession.update({
    where: { id: sessionId },
    data: {
      pricingWeightOz,
      shippingCostCents,
      capReached,
    },
  });

  return {
    sessionId,
    shippingCostCents,
    pricingWeightOz,
    capReached,
  };
}

async function getLiveShippingSessionSummaryTx(tx: TransactionClient, sessionId: string) {
  const row = await tx.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      pricingWeightOz: true,
      shippingCostCents: true,
      capReached: true,
    },
  });
  if (!row) return null;
  return {
    sessionId: row.id,
    shippingCostCents: row.shippingCostCents,
    pricingWeightOz: row.pricingWeightOz,
    capReached: row.capReached,
  };
}

export async function getLiveShippingSessionSummary(sessionId: string) {
  return prisma.$transaction((tx) => getLiveShippingSessionSummaryTx(tx, sessionId));
}

/** Remove a refunded order from its live bundled session and recalculate session totals. */
export async function removeOrderFromLiveShippingSessionOnRefundTx(
  tx: TransactionClient,
  orderId: string,
): Promise<void> {
  const item = await tx.liveShippingSessionItem.findUnique({
    where: { orderId },
    select: {
      sessionId: true,
      listing: { select: { shippingPriceCapCents: true } },
    },
  });
  if (!item) {
    await tx.order.updateMany({
      where: { id: orderId },
      data: { liveShippingSessionId: null },
    });
    return;
  }

  await tx.liveShippingSessionItem.delete({ where: { orderId } });
  await recalcLiveShippingSessionTx(tx, item.sessionId, item.listing?.shippingPriceCapCents ?? null);
  await tx.order.update({
    where: { id: orderId },
    data: { liveShippingSessionId: null },
  });
}
