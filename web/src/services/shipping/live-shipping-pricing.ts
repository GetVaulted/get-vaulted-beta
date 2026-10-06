import type { ShippingCategory } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { resolveShippingProfileDimensions } from "@/lib/unified-shipping-engine";
import { prisma } from "@/lib/prisma";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import {
  buildSessionPackageGroups,
  refreshLiveShippingSessionShippoEstimate,
} from "@/services/shipping/live-shipping-quote";
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
  { maxWeightOz: Number.POSITIVE_INFINITY, costCents: 999 },
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

import { settleLiveOrderShippingTx } from "@/services/shipping/live-commerce-shipping-settlement";
import { resolveLiveShowShippingCapCents } from "@/lib/live-show-shipping-terms";
import { calculateLiveShippingCost as tierEstimateCents } from "@/services/shipping/live-shipping-tier-estimate";
import { computeBuyerLiveShippingTotals } from "@/lib/unified-shipping-engine";

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

/**
 * Weight-tier estimate in cents (uncapped). Caps/subsidy are applied by buyer charge helpers.
 * `@param _capCents` retained for call-site compatibility; ignored.
 */
export function calculateLiveShippingCost(weightOz: number, _capCents?: number | null): number {
  return tierEstimateCents(weightOz);
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
  const rawNewCost = calculateLiveShippingCost(newWeight);
  const buyerNewTotal = computeBuyerLiveShippingTotals({
    shippingMode: "capped",
    shippingCapCents: args.listingCapCents ?? null,
    sellerPaysOverCap: true,
    estimatedEligibleBundleShippingCents: rawNewCost,
    shippingAlreadyChargedCents: 0,
  }).buyerTotalShippingCents;
  return Math.max(0, buyerNewTotal - args.currentShippingCostCents);
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
  const rawCents = calculateLiveShippingCost(baseWeightOz);
  return Math.min(rawCents, resolveLiveShowShippingCapCents(listing.shippingPriceCapCents ?? null));
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
    const liveShowId = opts?.liveShowId?.trim() || null;
    const liveRoomItemId = opts?.liveRoomItemId?.trim() || null;
    const sessionOpts: AddOrderToLiveShippingSessionOpts | null =
      liveShowId || liveRoomItemId ? { liveShowId, liveRoomItemId } : opts ?? null;

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
      await settleLiveOrderShippingTx(tx, order.id, sessionOpts);
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
      liveShowId && liveRoomItemId
        ? await tx.liveRoomItem.findFirst({
            where: {
              id: liveRoomItemId,
              liveRoomId: liveShowId,
              liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "break", "sale"] } },
            },
            select: {
              listingId: true,
              liveRoomId: true,
              shippingProfileId: true,
              customWeightOz: true,
              customLengthIn: true,
              customWidthIn: true,
              customHeightIn: true,
              requiresSeparatePackage: true,
              shippingProfile: true,
              liveRoom: { select: { defaultShippingProfileId: true, category: true } },
            },
          })
        : liveShowId
          ? await tx.liveRoomItem.findFirst({
              where: {
                listingId: order.listingId,
                liveRoomId: liveShowId,
                liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "break", "sale"] } },
              },
              select: {
                listingId: true,
                liveRoomId: true,
                shippingProfileId: true,
                customWeightOz: true,
                customLengthIn: true,
                customWidthIn: true,
                customHeightIn: true,
                requiresSeparatePackage: true,
                shippingProfile: true,
                liveRoom: { select: { defaultShippingProfileId: true, category: true } },
              },
            })
          : await tx.liveRoomItem.findFirst({
              where: {
                listingId: order.listingId,
                liveRoom: { sellerId: order.sellerId, roomType: { in: ["auction", "break", "sale"] } },
              },
              select: {
                listingId: true,
                liveRoomId: true,
                shippingProfileId: true,
                customWeightOz: true,
                customLengthIn: true,
                customWidthIn: true,
                customHeightIn: true,
                requiresSeparatePackage: true,
                shippingProfile: true,
                liveRoom: { select: { defaultShippingProfileId: true, category: true } },
              },
              orderBy: { updatedAt: "desc" },
            });

    const showOnly =
      !liveItem && liveShowId
        ? await tx.liveRoom.findFirst({
            where: { id: liveShowId },
            select: {
              id: true,
              sellerId: true,
              defaultShippingProfileId: true,
              category: true,
              shippingCapEnabled: true,
              shippingCapCents: true,
              freeShippingEnabled: true,
            },
          })
        : null;

    if (!liveItem && !showOnly) throw new Error("LIVE_SHIPPING_NOT_APPLICABLE");
    if (showOnly && showOnly.sellerId !== order.sellerId) {
      throw new Error("LIVE_SHIPPING_SELLER_MISMATCH");
    }

    const liveRoomId = liveItem?.liveRoomId ?? showOnly!.id;

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
    liveShowId: liveRoomId,
    destinationAddressId: shipAloneAddressKey,
  });

  if (session.shippingCapCents == null) {
    const show = showOnly
      ?? (await tx.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: {
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
        },
      }));
    if (show) {
      await tx.liveShippingSession.update({
        where: { id: session.id },
        data: {
          shippingCapCents: show.shippingCapEnabled ? show.shippingCapCents : null,
          freeShippingApplied: show.freeShippingEnabled,
        },
      });
    }
  }

  const showCap =
    showOnly ??
    (await tx.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { shippingCapEnabled: true, shippingCapCents: true, freeShippingEnabled: true },
    }));
  const effectiveCapCents =
    showCap?.freeShippingEnabled
      ? 0
      : showCap?.shippingCapEnabled && showCap.shippingCapCents != null
        ? showCap.shippingCapCents
        : listing.shippingPriceCapCents ?? null;

    // Exclude siblings whose payment failed/expired/was refunded or charged back — they never
    // actually shipped, so they must not count as "already have a bundled item" and shrink this
    // item's weight down to the cheaper incremental tier. Otherwise a declined-then-retried (or a
    // fresh) purchase right after a failed one gets under-weighted and under-charged.
    const itemCount = await tx.liveShippingSessionItem.count({
      where: {
        sessionId: session.id,
        order: { paymentStatus: { notIn: ["failed", "expired", "refunded", "chargeback"] } },
      },
    });

    // Break/PYT queue rows (liveRoomItem.listingId === null) are host board rows, not the item being
    // shipped. Their platform profile (e.g. "Full-Size Helmet") belongs to the queue row, not to the
    // ephemeral "Live spot: X" listing the buyer actually receives. Use the listing-derived weight
    // (baseWeightOz / incrementalWeightOz) for those to avoid charging card buyers helmet rates.
    const isBreakSpotQueueRow = liveItem != null && liveRoomItemId != null && liveItem.listingId == null;

    let appliedWeightOz = itemCount === 0 ? baseWeightOz : incrementalWeightOz;
    if (liveItem?.shippingProfile && !isBreakSpotQueueRow) {
      const resolved = resolveShippingProfileDimensions(liveItem.shippingProfile, liveItem);
      // Separate-package profiles (helmets, etc.) always contribute full package weight.
      appliedWeightOz =
        itemCount === 0 || resolved.requiresSeparatePackage
          ? resolved.weightOz
          : Math.max(1, resolved.weightOz * 0.25);
    } else if (!isBreakSpotQueueRow) {
      const fallbackProfile = await resolveDefaultProfileForLiveShow({
        showDefaultProfileId: liveItem?.liveRoom.defaultShippingProfileId ?? showOnly?.defaultShippingProfileId ?? null,
        category: liveItem?.liveRoom.category ?? showOnly?.category ?? null,
        db: tx,
      });
      if (fallbackProfile) {
        const resolved = resolveShippingProfileDimensions(fallbackProfile, liveItem ?? undefined);
        appliedWeightOz =
          itemCount === 0 || resolved.requiresSeparatePackage
            ? resolved.weightOz
            : Math.max(1, resolved.weightOz * 0.25);
      }
    }

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

    const summary = await recalcLiveShippingSessionTx(tx, session.id, effectiveCapCents, {
      freeShipping: showCap?.freeShippingEnabled === true,
    });

    await tx.order.update({
      where: { id: order.id },
      data: { liveShippingSessionId: session.id },
    });

    await settleLiveOrderShippingTx(tx, order.id, sessionOpts);

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
  const summary = await prisma.$transaction(async (tx) => addOrderToLiveShippingSessionTx(tx, orderId, opts));
  try {
    await refreshLiveShippingSessionShippoEstimate(summary.sessionId);
    const refreshed = await getLiveShippingSessionSummary(summary.sessionId);
    return refreshed ?? summary;
  } catch (e) {
    console.warn("[live-shipping] Shippo refresh failed; using tier estimate", e);
    return summary;
  }
}

async function recalcLiveShippingSessionTx(
  tx: TransactionClient,
  sessionId: string,
  capCents?: number | null,
  opts?: { freeShipping?: boolean },
) {
  const { computeSessionPoolTotals, computePoolTotalsFromGroups, liveShowShippingConfigFromRoom } =
    await import("@/services/shipping/live-shipping-pool");

  const session = await tx.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      liveShow: {
        select: {
          shippingMode: true,
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
          sellerPaysOverCap: true,
          carrierPreference: true,
          shippingTermsVersion: true,
          bundleEligiblePurchases: true,
        },
      },
    },
  });
  if (!session) {
    throw new Error("LIVE_SHIPPING_SESSION_NOT_FOUND");
  }

  const showConfig = liveShowShippingConfigFromRoom({
    ...session.liveShow,
    freeShippingEnabled: opts?.freeShipping === true ? true : session.liveShow.freeShippingEnabled,
    shippingCapCents:
      capCents !== undefined && capCents !== null
        ? capCents
        : session.liveShow.shippingCapCents,
    shippingCapEnabled:
      capCents !== undefined && capCents !== null ? true : session.liveShow.shippingCapEnabled,
  });

  const pool = await computeSessionPoolTotals(sessionId, tx);
  const totals = pool ?? computePoolTotalsFromGroups([], showConfig);

  await tx.liveShippingSession.update({
    where: { id: sessionId },
    data: {
      pricingWeightOz: totals.pricingWeightOz,
      shippingCostCents: totals.buyerTotalCents,
      capReached: totals.capReached,
      freeShippingApplied: totals.freeShippingApplied,
      estimatedEligibleShippingCents: totals.rawEstimateCents,
      estimatedLabelCostCents: totals.rawEstimateCents,
      finalLabelCostCents: totals.rawEstimateCents,
      sellerShippingSubsidyCents: totals.sellerSubsidyCents,
      shippingMode: showConfig.shippingMode ?? null,
      carrierPreference: session.liveShow.carrierPreference ?? null,
      shippingTermsVersion: session.liveShow.shippingTermsVersion ?? null,
      shippingCapCents: showConfig.shippingCapCents,
    },
  });

  return {
    sessionId,
    shippingCostCents: totals.buyerTotalCents,
    pricingWeightOz: totals.pricingWeightOz,
    capReached: totals.capReached,
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
