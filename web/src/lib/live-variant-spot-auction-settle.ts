import { prisma } from "@/lib/prisma";
import { finalizeLiveItemVariantPurchasePaid } from "@/lib/live-item-variant-purchase";
import { settleLiveItemVariantPurchase } from "@/lib/live-payment-pipeline";
import { isStripeConfigured } from "@/lib/stripe";
import {
  emitActiveItemChanged,
  emitLiveRoomQueueItemsChanged,
  emitVariantPurchased,
} from "@/lib/realtime-emit-server";
import { idleVariantSpotCommerceReset } from "@/lib/live-variant-spot-commerce";
import type { FinalizeTrigger } from "@/lib/live-auction-finalize";
import { resolveSoldUnitDisplayTitle } from "@/lib/live-room-item-quantity-display";
import { summarizeVariantSpots } from "@/lib/live-item-variant-presets";

/** Close a PYT/PYD spot auction with no bids — keep pin, return to fixed checkout. */
export async function resetVariantSpotAuctionNoBids(args: {
  liveRoomId: string;
  itemId: string;
  trigger: FinalizeTrigger;
}): Promise<{ reset: boolean }> {
  const next = await prisma.$transaction(async (tx) => {
    const updated = await tx.liveRoomItem.updateMany({
      where: { id: args.itemId, liveRoomId: args.liveRoomId, status: "active", biddingOpen: true },
      data: {
        ...idleVariantSpotCommerceReset(),
        itemVersion: { increment: 1 },
      },
    });
    if (updated.count === 0) return null;
    const roomNext = await tx.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { roomVersion: { increment: 1 } },
      select: { roomVersion: true },
    });
    const itemNext = await tx.liveRoomItem.findUnique({
      where: { id: args.itemId },
      select: { itemVersion: true },
    });
    return { roomVersion: roomNext.roomVersion, itemVersion: itemNext?.itemVersion ?? 0 };
  });
  if (!next) return { reset: false };
  emitActiveItemChanged(args.liveRoomId, args.itemId, {
    roomVersion: next.roomVersion,
    itemVersion: next.itemVersion,
    biddingOpen: false,
    auctionEndsAt: null,
  });
  emitLiveRoomQueueItemsChanged(args.liveRoomId);
  console.info("[variant spot auction] no bids, reset to fixed", {
    trigger: args.trigger,
    liveRoomId: args.liveRoomId,
    itemId: args.itemId,
  });
  return { reset: true };
}

type LockedVariantSpotAuctionRow = {
  id: string;
  status: string;
  biddingOpen: boolean;
  auctionVariantId: string | null;
  lastHighBidderId: string | null;
  currentBidUsd: number | null;
};

/**
 * Timer ended with winner — charge winner and mark only the auctioned variant sold.
 *
 * The pre-check used to be a plain read outside any transaction, with no claim on the
 * `LiveRoomItem` row inside it either — only the variant's `quantityRemaining` decrement was
 * atomic. If the variant had 2+ units remaining, two concurrent settle calls for the *same*
 * auction win (e.g. overdue-sweep firing twice) could each pass and create two separate
 * purchases/charges for one auction. `FOR UPDATE` + an immediate claim update closes that gap.
 */
export async function settleVariantSpotAuctionWinner(args: {
  liveRoomId: string;
  itemId: string;
  trigger: FinalizeTrigger;
}): Promise<{ settled: boolean; purchaseId?: string }> {
  let purchaseId: string | undefined;
  let claimed = true;
  let variantId: string | undefined;
  let buyerId: string | undefined;

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedVariantSpotAuctionRow[]>`
      SELECT id, status, "biddingOpen", "auctionVariantId", "lastHighBidderId", "currentBidUsd"
      FROM "LiveRoomItem"
      WHERE id = ${args.itemId} AND "liveRoomId" = ${args.liveRoomId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row || row.status !== "active" || !row.biddingOpen || !row.auctionVariantId || !row.lastHighBidderId?.trim()) {
      claimed = false;
      return;
    }
    const winUsdCheck = row.currentBidUsd ?? 0;
    if (!Number.isFinite(winUsdCheck) || winUsdCheck < 1) {
      claimed = false;
      return;
    }

    // Claim immediately: flips biddingOpen off inside the same locked transaction so no other
    // concurrent settle/reset call can act on this lot once we proceed past this point.
    await tx.liveRoomItem.update({
      where: { id: args.itemId },
      data: { ...idleVariantSpotCommerceReset(), itemVersion: { increment: 1 } },
    });

    variantId = row.auctionVariantId;
    buyerId = row.lastHighBidderId.trim();
    const winUsd = winUsdCheck;

    const variant = await tx.liveItemVariant.findFirst({
      where: { id: variantId, liveRoomItemId: args.itemId },
      select: { id: true, quantityRemaining: true, priceUsd: true },
    });
    if (!variant || variant.quantityRemaining < 1) {
      throw Object.assign(new Error("VARIANT_SOLD_OUT"), { code: "VARIANT_SOLD_OUT" });
    }

    const updated = await tx.liveItemVariant.updateMany({
      where: { id: variantId, quantityRemaining: { gte: 1 } },
      data: {
        quantityRemaining: { decrement: 1 },
        soldCount: { increment: 1 },
      },
    });
    if (updated.count === 0) throw Object.assign(new Error("VARIANT_SOLD_OUT"), { code: "VARIANT_SOLD_OUT" });

    const purchase = await tx.liveItemVariantPurchase.create({
      data: {
        liveRoomId: args.liveRoomId,
        liveRoomItemId: args.itemId,
        variantId,
        buyerId,
        quantity: 1,
        unitPriceUsd: winUsd,
        totalUsd: winUsd,
        paymentStatus: winUsd <= 0 || !isStripeConfigured() ? "paid" : "pending_payment",
        paidAt: winUsd <= 0 || !isStripeConfigured() ? new Date() : undefined,
      },
      select: { id: true, totalUsd: true },
    });
    purchaseId = purchase.id;

    const remaining = await tx.liveItemVariant.findUnique({
      where: { id: variantId },
      select: { quantityRemaining: true },
    });
    if (remaining && remaining.quantityRemaining <= 0) {
      await tx.liveItemVariant.update({
        where: { id: variantId },
        data: { status: "sold_out", isHot: false },
      });
    } else {
      await tx.liveItemVariant.update({
        where: { id: variantId },
        data: { isHot: false },
      });
    }

    await tx.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
  });

  if (!claimed || !purchaseId || !variantId || !buyerId) return { settled: false };

  if (isStripeConfigured()) {
    const settled = await settleLiveItemVariantPurchase({ buyerId, purchaseId });
    if (settled.ok && "paid" in settled && settled.paid) {
      await finalizeLiveItemVariantPurchasePaid(purchaseId);
    } else if (!settled.ok) {
      console.error("[variant spot auction] charge failed", { purchaseId, error: settled.message });
    }
  } else {
    await finalizeLiveItemVariantPurchasePaid(purchaseId);
  }

  const itemNext = await prisma.liveRoomItem.findUnique({
    where: { id: args.itemId },
    select: { itemVersion: true },
  });
  const roomNext = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { roomVersion: true },
  });
  const purchaseRow = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      totalUsd: true,
      buyer: { select: { username: true } },
      variant: { select: { label: true } },
    },
  });
  const lotRow = await prisma.liveRoomItem.findUnique({
    where: { id: args.itemId },
    select: {
      title: true,
      quantity: true,
      quantityInitial: true,
      variants: { select: { soldCount: true, quantityRemaining: true, status: true, priceUsd: true } },
    },
  });
  const unitsSoldAfter = lotRow?.variants?.length
    ? summarizeVariantSpots(
        lotRow.variants.map((v) => ({
          soldCount: v.soldCount,
          quantityRemaining: v.quantityRemaining,
          status: v.status,
          priceUsd: v.priceUsd,
        })),
      ).sold
    : 1;
  // Match on-screen lot description at hammer ("PYT Break 1 #3"), not only the team pin label.
  const celebrationLabel = lotRow
    ? resolveSoldUnitDisplayTitle({
        title: lotRow.title,
        quantity: lotRow.quantity,
        quantityInitial: lotRow.quantityInitial,
        unitsSoldAfter,
      })
    : (purchaseRow?.variant.label ?? "Spot");

  emitVariantPurchased(args.liveRoomId, {
    itemId: args.itemId,
    variantId,
    itemVersion: itemNext?.itemVersion ?? 0,
    purchaseId,
    label: celebrationLabel,
    buyerUsername: purchaseRow?.buyer.username?.trim() ?? "buyer",
    amountUsd: purchaseRow?.totalUsd,
  });
  emitActiveItemChanged(args.liveRoomId, args.itemId, {
    roomVersion: roomNext?.roomVersion,
    itemVersion: itemNext?.itemVersion,
    biddingOpen: false,
    auctionEndsAt: null,
  });
  emitLiveRoomQueueItemsChanged(args.liveRoomId);

  console.info("[variant spot auction] winner settled", {
    trigger: args.trigger,
    liveRoomId: args.liveRoomId,
    itemId: args.itemId,
    variantId,
    purchaseId,
  });
  return { settled: true, purchaseId };
}
