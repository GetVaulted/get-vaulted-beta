import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  applicationFeeCentsFromSubtotalUsd,
  completedLiveShowGmvBeforeSale,
  liveShowPlatformFeePercent,
  marketplacePlatformFeePercent,
  platformFeeBaseUsd,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";
import { prisma } from "@/lib/prisma";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { ensureMarketplacePlatformFeeCache } from "@/services/platform-fee-settings";
import { loadSellerPlatformFeePercentOverride } from "@/services/seller-platform-fee-override";

/** Immutable platform-fee snapshot written on Order at charge time. */
export type PlatformFeeChargeSnapshot = {
  platformFeeBasisCents: number;
  platformFeePercentApplied: number;
  platformFeeCents: number;
  platformFeePriorShowGmvUsd: number | null;
  platformFeeSellerOverrideApplied: boolean;
};

export async function resolveCheckoutPlatformFeeSnapshot(args: {
  /** Item/sale price only — excludes shipping, tax, and tips. */
  saleAmountUsd: number;
  isCompanyListing: boolean;
  liveRoomId?: string | null;
  sellerId?: string | null;
}): Promise<PlatformFeeChargeSnapshot> {
  const basisUsd = platformFeeBaseUsd(args.saleAmountUsd);
  const platformFeeBasisCents = Math.max(0, Math.round(basisUsd * 100));

  if (args.isCompanyListing) {
    return {
      platformFeeBasisCents,
      platformFeePercentApplied: 0,
      platformFeeCents: 0,
      platformFeePriorShowGmvUsd: args.liveRoomId ? 0 : null,
      platformFeeSellerOverrideApplied: false,
    };
  }

  const sellerOverride = args.sellerId ? await loadSellerPlatformFeePercentOverride(args.sellerId) : null;
  if (sellerOverride != null) {
    return {
      platformFeeBasisCents,
      platformFeePercentApplied: sellerOverride,
      platformFeeCents: applicationFeeCentsFromSubtotalUsd(basisUsd, sellerOverride),
      platformFeePriorShowGmvUsd: args.liveRoomId ? await getLiveRoomCompletedSalesGmvUsd(args.liveRoomId) : null,
      platformFeeSellerOverrideApplied: true,
    };
  }

  if (args.liveRoomId) {
    await ensureLiveShowFeeCache(true);
    const priorGmv = await getLiveRoomCompletedSalesGmvUsd(args.liveRoomId);
    const pct = liveShowPlatformFeePercent(priorGmv);
    return {
      platformFeeBasisCents,
      platformFeePercentApplied: pct,
      platformFeeCents: applicationFeeCentsFromSubtotalUsd(basisUsd, pct),
      platformFeePriorShowGmvUsd: priorGmv,
      platformFeeSellerOverrideApplied: false,
    };
  }

  await ensureMarketplacePlatformFeeCache(true);
  const pct = marketplacePlatformFeePercent();
  return {
    platformFeeBasisCents,
    platformFeePercentApplied: pct,
    platformFeeCents: applicationFeeCentsFromSubtotalUsd(basisUsd, pct),
    platformFeePriorShowGmvUsd: null,
    platformFeeSellerOverrideApplied: false,
  };
}

/**
 * Persist charge-time platform fee on the order. Only fills null columns unless `force`.
 * Never overwrites a prior snapshot (historical charges stay immutable).
 */
export async function persistOrderPlatformFeeSnapshot(args: {
  orderId: string;
  snapshot: PlatformFeeChargeSnapshot;
  force?: boolean;
}): Promise<void> {
  const orderId = args.orderId?.trim();
  if (!orderId) return;

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
    },
  });
  if (!existing) return;

  const force = args.force === true;
  if (
    !force &&
    existing.platformFeeCents != null &&
    existing.platformFeePercentApplied != null &&
    existing.platformFeeBasisCents != null
  ) {
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      platformFeeCents: args.snapshot.platformFeeCents,
      platformFeePercentApplied: args.snapshot.platformFeePercentApplied,
      platformFeeBasisCents: args.snapshot.platformFeeBasisCents,
      platformFeePriorShowGmvUsd: args.snapshot.platformFeePriorShowGmvUsd,
      platformFeeSellerOverrideApplied: args.snapshot.platformFeeSellerOverrideApplied,
    },
  });
}

/** Completed item sales GMV for the active live show (excludes shipping/tax). */
export async function getLiveRoomCompletedSalesGmvUsd(liveRoomId: string): Promise<number> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { completedSalesGmvUsd: true, status: true },
  });
  if (!room || room.status === "ended") return 0;
  return Math.max(0, room.completedSalesGmvUsd);
}

export async function recordLiveShowCompletedSaleTx(
  tx: TransactionClient,
  liveRoomId: string,
  saleAmountUsd: number,
): Promise<void> {
  const amt = Number(saleAmountUsd);
  if (!liveRoomId || !Number.isFinite(amt) || amt <= 0) return;
  await tx.liveRoom.updateMany({
    where: { id: liveRoomId, status: "live" },
    data: { completedSalesGmvUsd: { increment: amt } },
  });
}

/**
 * Roll back a previously-recorded sale's GMV contribution on refund/chargeback. Without this,
 * a refunded live sale keeps inflating `completedSalesGmvUsd`, which can push *subsequent* sales
 * in the same show into a lower fee tier than they should actually qualify for (platform
 * undercollects). Clamped at 0 via `GREATEST` — never goes negative regardless of ordering.
 */
export async function reverseLiveShowCompletedSaleTx(
  tx: TransactionClient,
  liveRoomId: string,
  saleAmountUsd: number,
): Promise<void> {
  const amt = Number(saleAmountUsd);
  if (!liveRoomId || !Number.isFinite(amt) || amt <= 0) return;
  await tx.$executeRaw`
    UPDATE "LiveRoom"
    SET "completedSalesGmvUsd" = GREATEST(0, "completedSalesGmvUsd" - ${amt})
    WHERE id = ${liveRoomId}
  `;
}

export async function resetLiveShowSalesGmvTx(tx: TransactionClient, liveRoomId: string): Promise<void> {
  await tx.liveRoom.updateMany({
    where: { id: liveRoomId },
    data: { completedSalesGmvUsd: 0 },
  });
}

/**
 * Fields to write when a live show transitions to `ended` (via "end", "cancel", or the
 * suspended-seller force-end guard). `completedSalesGmvUsd` keeps resetting to 0 exactly as
 * before — some callers (e.g. `buildLiveShowFeeTierSnapshot` in the host console) expect it to
 * represent "GMV so far in the *current* live session" and reset between shows. `finalSalesGmvUsd`
 * is a separate, never-reset snapshot of the true final total, taken once here, so historical
 * fee-tier reconstruction for this show's orders (see `liveShowGmvForFeeTierReconstruction`)
 * keeps working correctly after the show ends instead of drifting to 0.
 */
export function liveShowEndGmvFields(currentCompletedGmvUsd: number): {
  completedSalesGmvUsd: 0;
  finalSalesGmvUsd: number;
} {
  return { completedSalesGmvUsd: 0, finalSalesGmvUsd: Math.max(0, currentCompletedGmvUsd) };
}

/**
 * Resolves which GMV figure to feed into `resolvePlatformFeePercentForSellerOrder` when
 * reconstructing the fee tier that applied to a *past* live-show order.
 *
 * While the show is still `live`, cumulative GMV is still changing sale-to-sale, so the live
 * `completedSalesGmvUsd` counter is correct. Once the show is no longer `live`,
 * `completedSalesGmvUsd` has been reset to 0 (see `liveShowEndGmvFields`) and must not be used —
 * the persisted `finalSalesGmvUsd` snapshot is the correct stable figure instead.
 */
export function liveShowGmvForFeeTierReconstruction(
  liveShow: { status: string; completedSalesGmvUsd: number; finalSalesGmvUsd: number | null } | null | undefined,
): number | null {
  if (!liveShow) return null;
  if (liveShow.status === "live") return liveShow.completedSalesGmvUsd;
  return liveShow.finalSalesGmvUsd ?? 0;
}

export async function resolveLiveRoomIdForOrder(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      liveShippingSession: { select: { liveShowId: true } },
    },
  });
  return order?.liveShippingSession?.liveShowId ?? null;
}

export async function resolveLiveRoomIdForLiveRoomItem(liveRoomItemId: string | null | undefined): Promise<string | null> {
  const id = typeof liveRoomItemId === "string" ? liveRoomItemId.trim() : "";
  if (!id) return null;
  const row = await prisma.liveRoomItem.findUnique({
    where: { id },
    select: { liveRoomId: true },
  });
  return row?.liveRoomId ?? null;
}

export async function resolveCheckoutApplicationFeeCents(args: {
  /** Item/sale price only — excludes shipping, tax, and tips. */
  saleAmountUsd: number;
  isCompanyListing: boolean;
  liveRoomId?: string | null;
  sellerId?: string | null;
  /** When set, persists the charge-time platform fee snapshot on the order (null-safe). */
  orderId?: string | null;
}): Promise<number> {
  const snapshot = await resolveCheckoutPlatformFeeSnapshot(args);
  if (args.orderId) {
    await persistOrderPlatformFeeSnapshot({ orderId: args.orderId, snapshot });
  }
  return snapshot.platformFeeCents;
}

/**
 * Backfill platform fee snapshot when checkout created the PaymentIntent before the Order existed
 * (or for historical orders). Uses show GMV *before* this sale so tier matches charge-time.
 * Never overwrites an existing snapshot.
 */
export async function ensureOrderPlatformFeeSnapshotPersisted(orderId: string): Promise<void> {
  const id = orderId?.trim();
  if (!id) return;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
      itemPriceUsd: true,
      paymentStatus: true,
      sellerId: true,
      listing: { select: { isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true },
          },
        },
      },
    },
  });
  if (!order) return;
  if (
    order.platformFeeCents != null &&
    order.platformFeePercentApplied != null &&
    order.platformFeeBasisCents != null
  ) {
    return;
  }

  const liveShowId = order.liveShippingSession?.liveShowId ?? null;
  const liveShow = order.liveShippingSession?.liveShow ?? null;
  const reconstructedGmv = liveShowGmvForFeeTierReconstruction(liveShow);
  const priorGmv =
    liveShowId && order.paymentStatus === "paid"
      ? completedLiveShowGmvBeforeSale(reconstructedGmv ?? 0, order.itemPriceUsd)
      : (reconstructedGmv ?? 0);

  if (liveShowId) await ensureLiveShowFeeCache(true);
  else await ensureMarketplacePlatformFeeCache(true);

  const sellerOverride = await loadSellerPlatformFeePercentOverride(order.sellerId);
  const basisUsd = platformFeeBaseUsd(order.itemPriceUsd);
  const pct =
    sellerOverride != null
      ? sellerOverride
      : resolvePlatformFeePercentForCheckout({
          isCompanyListing: Boolean(order.listing.isCompanyListing),
          liveRoomId: liveShowId,
          completedLiveShowGmvUsd: priorGmv,
        });

  await persistOrderPlatformFeeSnapshot({
    orderId: id,
    snapshot: {
      platformFeeBasisCents: Math.max(0, Math.round(basisUsd * 100)),
      platformFeePercentApplied: order.listing.isCompanyListing ? 0 : pct,
      platformFeeCents: order.listing.isCompanyListing
        ? 0
        : applicationFeeCentsFromSubtotalUsd(basisUsd, pct),
      platformFeePriorShowGmvUsd: liveShowId ? priorGmv : null,
      platformFeeSellerOverrideApplied: sellerOverride != null,
    },
  });
}
