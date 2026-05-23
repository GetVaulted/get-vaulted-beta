import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { liveShowApplicationFeeCents, marketplaceApplicationFeeCents } from "@/lib/platform-fee-policy";
import { prisma } from "@/lib/prisma";

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

export async function resetLiveShowSalesGmvTx(tx: TransactionClient, liveRoomId: string): Promise<void> {
  await tx.liveRoom.updateMany({
    where: { id: liveRoomId },
    data: { completedSalesGmvUsd: 0 },
  });
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
  subtotalUsd: number;
  isCompanyListing: boolean;
  liveRoomId?: string | null;
}): Promise<number> {
  if (args.isCompanyListing) return 0;
  if (args.liveRoomId) {
    const gmv = await getLiveRoomCompletedSalesGmvUsd(args.liveRoomId);
    return liveShowApplicationFeeCents(args.subtotalUsd, gmv, false);
  }
  return marketplaceApplicationFeeCents(args.subtotalUsd, false);
}
