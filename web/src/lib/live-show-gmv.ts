import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import {
  applicationFeeCentsFromSubtotalUsd,
  liveShowApplicationFeeCents,
  marketplaceApplicationFeeCents,
  platformFeeBaseUsd,
} from "@/lib/platform-fee-policy";
import { prisma } from "@/lib/prisma";
import { loadSellerPlatformFeePercentOverride } from "@/services/seller-platform-fee-override";

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
}): Promise<number> {
  if (args.isCompanyListing) return 0;
  const sellerOverride = args.sellerId ? await loadSellerPlatformFeePercentOverride(args.sellerId) : null;
  if (sellerOverride != null) {
    return applicationFeeCentsFromSubtotalUsd(platformFeeBaseUsd(args.saleAmountUsd), sellerOverride);
  }
  if (args.liveRoomId) {
    const gmv = await getLiveRoomCompletedSalesGmvUsd(args.liveRoomId);
    return liveShowApplicationFeeCents(args.saleAmountUsd, gmv, false);
  }
  return marketplaceApplicationFeeCents(args.saleAmountUsd, false);
}
