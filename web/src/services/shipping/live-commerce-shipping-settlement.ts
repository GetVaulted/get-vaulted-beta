import type { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  computeBuyerLiveShippingTotals,
  resolveShippingProfileDimensions,
  serializeProfileSnapshot,
} from "@/lib/unified-shipping-engine";
import {
  liveShowShippingTermsFromRoom,
  liveShowShippingConfigFromTerms,
  PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS,
  type LiveShowShippingTerms,
} from "@/lib/live-show-shipping-terms";
import { roundUsd } from "@/lib/round-usd";
import type { AddOrderToLiveShippingSessionOpts } from "@/services/shipping/live-shipping-pricing";
import { resolveDefaultProfileForLiveShow } from "@/services/shipping/platform-shipping-profiles";
import {
  resolveBreakSpotSellerProfile,
  resolveSellerProfileForLiveRoomItem,
  sellerShippingProfileToProfileInput,
} from "@/services/shipping/seller-shipping-profiles";

export type LiveOrderShippingTermsSnapshot = {
  liveShowId: string;
  sellerId: string;
  buyerId: string;
  shippingMode: LiveShowShippingTerms["shippingMode"];
  shippingCapCents: number | null;
  shippingCapIncrementCents?: number | null;
  carrierPreference: LiveShowShippingTerms["carrierPreference"];
  bundleEligiblePurchases: boolean;
  selectedShippingProfileId: string | null;
  shippingProfileSnapshot: Record<string, unknown> | null;
  estimatedShippingBeforePurchaseCents: number;
  shippingChargedThisPurchaseCents: number;
  totalShippingChargedSoFarCents: number;
  shippingTermsVersion: number;
  capturedAt: string;
  idempotencyKey: string;
};

export type LiveOrderShippingSettlementResult = {
  sessionId: string;
  shippingCostCents: number;
  shippingDueCents: number;
  shippingPriceUsd: number;
  capReached: boolean;
  snapshot: LiveOrderShippingTermsSnapshot;
};

/** True when live shipping for this order was already settled into an immutable snapshot. */
export function hasLiveShippingTermsSnapshot(shippingTermsSnapshotJson: unknown): boolean {
  return shippingTermsSnapshotJson != null && typeof shippingTermsSnapshotJson === "object";
}

/**
 * Buyer shipping USD for pay-order checkout.
 * Once a terms snapshot exists, keep the settled `orderShippingPriceUsd` (never recompute from a
 * later session estimate refresh). Unsettled orders may still derive remaining session balance.
 */
export function resolvePayOrderLiveShippingUsd(args: {
  orderShippingPriceUsd: number;
  shippingTermsSnapshotJson: unknown;
  sessionShippingCostCents: number | null | undefined;
  siblingPaidShippingCents: number;
}): number {
  if (hasLiveShippingTermsSnapshot(args.shippingTermsSnapshotJson)) {
    return Math.max(0, args.orderShippingPriceUsd);
  }
  if (args.sessionShippingCostCents == null || !Number.isFinite(args.sessionShippingCostCents)) {
    return Math.max(0, args.orderShippingPriceUsd);
  }
  const already = Math.max(0, Math.floor(args.siblingPaidShippingCents));
  const remainingCents = Math.max(0, Math.floor(args.sessionShippingCostCents) - already);
  return remainingCents / 100;
}

/**
 * Raw estimate for settlement subsidy math: prefer uncapped estimatedLabelCostCents;
 * fall back to shippingCostCents only for legacy rows missing the label estimate.
 */
export function resolveLiveSessionRawEstimateCents(session: {
  shippingCostCents: number;
  estimatedLabelCostCents?: number | null;
}): number {
  if (session.estimatedLabelCostCents != null && Number.isFinite(session.estimatedLabelCostCents)) {
    return Math.max(0, Math.floor(session.estimatedLabelCostCents));
  }
  return Math.max(0, Math.floor(session.shippingCostCents));
}

/** Row-lock the live shipping session so concurrent purchases serialize cap math. */
export async function lockLiveShippingSessionForUpdateTx(
  tx: TransactionClient,
  sessionId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM "LiveShippingSession" WHERE id = ${sessionId} FOR UPDATE`;
}

// Mirrors the string values of PAYMENT_FAILED / PAYMENT_EXPIRED / PAYMENT_REFUNDED /
// PAYMENT_CHARGEBACK in `@/services/payments`. Duplicated as literals (not imported) because
// payments.ts already imports from this file at runtime — importing back would create a cycle.
// A sibling order in one of these states never actually collected its shipping charge (payment
// failed/expired before it was captured, or the charge was later reversed), so it must not count
// toward this buyer's shipping cap ledger. Leaving it in the sum is what caused a later purchase in
// the same live show to come back as free/heavily-discounted shipping after an earlier payment was
// declined and retried: the failed order's never-collected shipping was still being treated as
// "already reserved."
const LIVE_SHIPPING_RESERVATION_EXCLUDED_PAYMENT_STATUSES = [
  "failed",
  "expired",
  "refunded",
  "chargeback",
] as const;

/**
 * Walks backward through `LiveRoom.continuationOfLiveRoomId` to find the chain of ended shows this
 * live show is auto-linked to as a continuation (same seller, same room type, ended recently — see
 * `findRecentEndedLiveRoomIdForContinuation`). Returns liveShowIds newest-first, always including
 * the given id. Capped defensively against a data anomaly (self-reference/cycle).
 */
async function resolveLiveShowContinuationChainIds(
  tx: TransactionClient,
  liveShowId: string,
): Promise<string[]> {
  const chain: string[] = [liveShowId];
  let cursor = liveShowId;
  for (let i = 0; i < 25; i++) {
    const room = await tx.liveRoom.findUnique({
      where: { id: cursor },
      select: { continuationOfLiveRoomId: true },
    });
    const prev = room?.continuationOfLiveRoomId ?? null;
    if (!prev || chain.includes(prev)) break;
    chain.push(prev);
    cursor = prev;
  }
  return chain;
}

/**
 * Resolves every `LiveShippingSession` id for this same buyer/seller/destination across the show's
 * continuation chain (itself plus any recently-ended predecessor shows it was auto-linked to). A
 * brand-new show has no predecessor and this just returns `[sessionId]` unchanged.
 */
async function resolveContinuationLinkedSessionIdsTx(
  tx: TransactionClient,
  sessionId: string,
): Promise<string[]> {
  const session = await tx.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: { id: true, buyerId: true, sellerId: true, liveShowId: true, destinationAddressId: true },
  });
  if (!session) return [sessionId];

  const chainLiveShowIds = await resolveLiveShowContinuationChainIds(tx, session.liveShowId);
  if (chainLiveShowIds.length <= 1) return [sessionId];

  const siblingSessions = await tx.liveShippingSession.findMany({
    where: {
      buyerId: session.buyerId,
      sellerId: session.sellerId,
      destinationAddressId: session.destinationAddressId,
      liveShowId: { in: chainLiveShowIds },
    },
    select: { id: true },
  });
  const ids = siblingSessions.map((s) => s.id);
  return ids.includes(sessionId) ? ids : [sessionId, ...ids];
}

/**
 * Sum shipping reserved on sibling orders in the same bundled session — plus, when this show is a
 * continuation of a recently-ended show (see `findRecentEndedLiveRoomIdForContinuation`), this same
 * buyer's reserved shipping in that predecessor show's session too, so their cap carries forward
 * instead of resetting to $0. Includes pending, requires-action, and paid orders. Orders whose
 * payment failed/expired/was refunded/charged back never actually collected shipping and are
 * excluded — otherwise a declined payment permanently (and wrongly) eats into the buyer's shipping
 * cap for every later purchase in the same show, making them look free/discounted.
 */
export async function sumSessionReservedShippingCentsTx(
  tx: TransactionClient,
  sessionId: string,
  excludeOrderId?: string | null,
): Promise<number> {
  const sessionIds = await resolveContinuationLinkedSessionIdsTx(tx, sessionId);
  const orders = await tx.order.findMany({
    where: {
      liveShippingSessionId: { in: sessionIds },
      paymentStatus: { notIn: [...LIVE_SHIPPING_RESERVATION_EXCLUDED_PAYMENT_STATUSES] },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { shippingPriceUsd: true, shippingChargedCents: true },
  });
  return orders.reduce((sum, o) => {
    if (o.shippingChargedCents != null && Number.isFinite(o.shippingChargedCents)) {
      return sum + Math.max(0, Math.floor(o.shippingChargedCents));
    }
    return sum + Math.round(Math.max(0, o.shippingPriceUsd) * 100);
  }, 0);
}

async function resolveShippingProfileForOrderTx(
  tx: TransactionClient,
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<{ profileId: string | null; profileSnapshot: Record<string, unknown> | null }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { sellerId: true, listingId: true },
  });
  if (!order) return { profileId: null, profileSnapshot: null };

  const liveItem =
    opts?.liveShowId && opts?.liveRoomItemId
      ? await tx.liveRoomItem.findFirst({
          where: {
            id: opts.liveRoomItemId,
            liveRoomId: opts.liveShowId,
            liveRoom: { sellerId: order.sellerId },
          },
          select: {
            sellerShippingProfileId: true,
            shippingProfileId: true,
            customWeightOz: true,
            customLengthIn: true,
            customWidthIn: true,
            customHeightIn: true,
            requiresSeparatePackage: true,
            shippingProfile: true,
            shippingProfileSnapshotJson: true,
            liveRoom: {
              select: {
                defaultSellerShippingProfileId: true,
                defaultShippingProfileId: true,
                category: true,
                roomType: true,
              },
            },
          },
        })
      : opts?.liveShowId
        ? await tx.liveRoomItem.findFirst({
            where: { listingId: order.listingId, liveRoomId: opts.liveShowId },
            select: {
              sellerShippingProfileId: true,
              shippingProfileId: true,
              customWeightOz: true,
              customLengthIn: true,
              customWidthIn: true,
              customHeightIn: true,
              requiresSeparatePackage: true,
              shippingProfile: true,
              shippingProfileSnapshotJson: true,
              liveRoom: {
                select: {
                  defaultSellerShippingProfileId: true,
                  defaultShippingProfileId: true,
                  category: true,
                  roomType: true,
                },
              },
            },
          })
        : await tx.liveRoomItem.findFirst({
            where: { listingId: order.listingId, liveRoom: { sellerId: order.sellerId } },
            orderBy: { updatedAt: "desc" },
            select: {
              sellerShippingProfileId: true,
              shippingProfileId: true,
              customWeightOz: true,
              customLengthIn: true,
              customWidthIn: true,
              customHeightIn: true,
              requiresSeparatePackage: true,
              shippingProfile: true,
              shippingProfileSnapshotJson: true,
              liveRoom: {
                select: {
                  defaultSellerShippingProfileId: true,
                  defaultShippingProfileId: true,
                  category: true,
                  roomType: true,
                },
              },
            },
          });

  const show =
    liveItem?.liveRoom ??
    (opts?.liveShowId
      ? await tx.liveRoom.findFirst({
          where: { id: opts.liveShowId, sellerId: order.sellerId },
          select: {
            defaultSellerShippingProfileId: true,
            defaultShippingProfileId: true,
            category: true,
            roomType: true,
          },
        })
      : null);

  const isBreakCommerce =
    liveItem?.liveRoom.roomType === "break" ||
    show?.roomType === "break" ||
    Boolean(opts?.liveRoomItemId);

  let sellerProfile = isBreakCommerce
    ? await resolveBreakSpotSellerProfile({
        sellerId: order.sellerId,
        showDefaultSellerProfileId: show?.defaultSellerShippingProfileId ?? null,
        itemSellerProfileId: liveItem?.sellerShippingProfileId ?? null,
        category: show?.category ?? liveItem?.liveRoom.category ?? null,
        db: tx,
      })
    : await resolveSellerProfileForLiveRoomItem({
        sellerId: order.sellerId,
        sellerShippingProfileId: liveItem?.sellerShippingProfileId ?? null,
        showDefaultSellerProfileId: show?.defaultSellerShippingProfileId ?? null,
        category: show?.category ?? liveItem?.liveRoom.category ?? null,
        db: tx,
      });

  let platformProfile = liveItem?.shippingProfile;
  if (!platformProfile && show) {
    platformProfile = await resolveDefaultProfileForLiveShow({
      showDefaultProfileId: show.defaultShippingProfileId,
      category: show.category,
      db: tx,
    });
  }

  const profileForDims = sellerProfile
    ? sellerShippingProfileToProfileInput(sellerProfile)
    : platformProfile;
  if (!profileForDims) {
    return { profileId: null, profileSnapshot: null };
  }

  if (liveItem?.shippingProfileSnapshotJson?.trim()) {
    try {
      return {
        profileId: sellerProfile?.id ?? liveItem.shippingProfileId ?? null,
        profileSnapshot: JSON.parse(liveItem.shippingProfileSnapshotJson) as Record<string, unknown>,
      };
    } catch {
      /* fall through */
    }
  }

  const resolved = resolveShippingProfileDimensions(profileForDims, liveItem ?? undefined);
  return {
    profileId: sellerProfile?.id ?? liveItem?.shippingProfileId ?? null,
    profileSnapshot: JSON.parse(serializeProfileSnapshot(resolved)) as Record<string, unknown>,
  };
}

function snapshotFromOrderRow(
  order: {
    id: string;
    buyerId: string;
    sellerId: string;
    shippingPriceUsd: number;
    shippingTermsSnapshotJson: Prisma.JsonValue;
  },
  sessionId: string,
): LiveOrderShippingSettlementResult | null {
  if (order.shippingTermsSnapshotJson == null || typeof order.shippingTermsSnapshotJson !== "object") {
    return null;
  }
  const snap = order.shippingTermsSnapshotJson as LiveOrderShippingTermsSnapshot;
  return {
    sessionId,
    shippingCostCents: snap.totalShippingChargedSoFarCents,
    shippingDueCents: snap.shippingChargedThisPurchaseCents,
    shippingPriceUsd: order.shippingPriceUsd,
    capReached: snap.totalShippingChargedSoFarCents >= (snap.shippingCapCents ?? Number.MAX_SAFE_INTEGER),
    snapshot: snap,
  };
}

/**
 * Atomically reserve incremental live shipping for an order and persist an immutable terms snapshot.
 * Idempotent per order — safe to retry after partial failure.
 *
 * Buyer protection: once `shippingTermsSnapshotJson` exists, this returns that snapshot and never
 * rewrites `shippingPriceUsd` / session `shippingChargedCents` for that order. Profile or rate
 * changes only affect unsettled / future purchases (incremental delta vs already charged).
 */
export async function settleLiveOrderShippingTx(
  tx: TransactionClient,
  orderId: string,
  opts?: AddOrderToLiveShippingSessionOpts | null,
): Promise<LiveOrderShippingSettlementResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      itemPriceUsd: true,
      taxUsd: true,
      liveShippingSessionId: true,
      shippingTermsSnapshotJson: true,
      shippingPriceUsd: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!order.liveShippingSessionId) throw new Error("LIVE_SHIPPING_SESSION_NOT_LINKED");

  const existing = snapshotFromOrderRow(order, order.liveShippingSessionId);
  if (existing) return existing;

  await lockLiveShippingSessionForUpdateTx(tx, order.liveShippingSessionId);

  const session = await tx.liveShippingSession.findUnique({
    where: { id: order.liveShippingSessionId },
    select: {
      id: true,
      shippingCostCents: true,
      estimatedLabelCostCents: true,
      liveShowId: true,
      liveShow: {
        select: {
          shippingMode: true,
          shippingCapEnabled: true,
          shippingCapCents: true,
          freeShippingEnabled: true,
          sellerPaysOverCap: true,
          carrierPreference: true,
          bundleEligiblePurchases: true,
          shippingTermsVersion: true,
          defaultShippingProfileId: true,
          defaultSellerShippingProfileId: true,
        },
      },
    },
  });
  if (!session) throw new Error("LIVE_SHIPPING_SESSION_NOT_FOUND");

  const showTerms = liveShowShippingTermsFromRoom(session.liveShow);
  const showConfig = liveShowShippingConfigFromTerms(showTerms);
  const alreadyReservedCents = await sumSessionReservedShippingCentsTx(tx, session.id, orderId);

  // Buyer session total stays on shippingCostCents; raw Shippo/tier estimate is estimatedLabelCostCents.
  // Never feed the capped buyer total back in as "raw" or seller subsidy collapses to 0.
  const rawEstimateCents = resolveLiveSessionRawEstimateCents(session);

  const totals = computeBuyerLiveShippingTotals({
    shippingMode: showConfig.shippingMode ?? "calculated",
    shippingCapCents: showConfig.shippingCapCents,
    sellerPaysOverCap: showConfig.sellerPaysOverCap !== false,
    estimatedEligibleBundleShippingCents: rawEstimateCents,
    shippingAlreadyChargedCents: alreadyReservedCents,
  });

  // Belt-and-suspenders: never let cumulative reserved shipping exceed the platform max.
  const roomLeftUnderPlatformMax = Math.max(
    0,
    PLATFORM_LIVE_BUYER_SHIPPING_MAX_CENTS - alreadyReservedCents,
  );
  const shippingDueCents = Math.min(totals.shippingDueForThisPurchaseCents, roomLeftUnderPlatformMax);
  const totalChargedSoFarCents = alreadyReservedCents + shippingDueCents;
  const shippingPriceUsd = shippingDueCents / 100;
  // Snapshot "before" is buyer session total (capped), not raw label estimate.
  const estimatedBeforeCents = Math.max(0, Math.floor(session.shippingCostCents) - shippingDueCents);

  const profileInfo = await resolveShippingProfileForOrderTx(tx, orderId, opts);
  const capturedAt = new Date().toISOString();

  const snapshot: LiveOrderShippingTermsSnapshot = {
    liveShowId: session.liveShowId,
    sellerId: order.sellerId,
    buyerId: order.buyerId,
    shippingMode: showTerms.shippingMode,
    shippingCapCents: showTerms.shippingCapCents,
    shippingCapIncrementCents: showConfig.shippingCapIncrementCents ?? null,
    carrierPreference: showTerms.carrierPreference,
    bundleEligiblePurchases: showTerms.bundleEligiblePurchases,
    selectedShippingProfileId: profileInfo.profileId,
    shippingProfileSnapshot: profileInfo.profileSnapshot,
    estimatedShippingBeforePurchaseCents: estimatedBeforeCents,
    shippingChargedThisPurchaseCents: shippingDueCents,
    totalShippingChargedSoFarCents: totalChargedSoFarCents,
    shippingTermsVersion: showTerms.shippingTermsVersion,
    capturedAt,
    idempotencyKey: orderId,
  };

  await tx.order.update({
    where: { id: orderId },
    data: {
      shippingPriceUsd,
      totalUsd: roundUsd(order.itemPriceUsd + shippingPriceUsd + order.taxUsd),
      shippingCapApplied: totals.capReached,
      freeShippingApplied: totals.freeShippingApplied,
      sellerShippingSubsidyCents: totals.sellerShippingSubsidyCents,
      shippingTermsVersion: showTerms.shippingTermsVersion,
      shippingTermsSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  await tx.liveShippingSession.update({
    where: { id: session.id },
    data: {
      shippingChargedCents: totalChargedSoFarCents,
      capReached: totals.capReached,
    },
  });

  return {
    sessionId: session.id,
    shippingCostCents: session.shippingCostCents,
    shippingDueCents,
    shippingPriceUsd,
    capReached: totals.capReached,
    snapshot,
  };
}

/** Re-sync order shipping from session (used before payment capture). Delegates to atomic settlement. */
export async function syncOrderShippingFromLiveSessionTx(tx: TransactionClient, orderId: string) {
  const ord = await tx.order.findUnique({
    where: { id: orderId },
    select: { liveShippingSessionId: true, shippingTermsSnapshotJson: true },
  });
  if (!ord?.liveShippingSessionId) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  if (ord.shippingTermsSnapshotJson != null) {
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  await settleLiveOrderShippingTx(tx, orderId);
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}
