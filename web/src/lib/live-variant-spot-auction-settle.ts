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

/** Timer ended with winner — charge winner and mark only the auctioned variant sold. */
export async function settleVariantSpotAuctionWinner(args: {
  liveRoomId: string;
  itemId: string;
  trigger: FinalizeTrigger;
}): Promise<{ settled: boolean; purchaseId?: string }> {
  const row = await prisma.liveRoomItem.findFirst({
    where: { id: args.itemId, liveRoomId: args.liveRoomId, status: "active", biddingOpen: true },
    select: {
      id: true,
      auctionVariantId: true,
      lastHighBidderId: true,
      currentBidUsd: true,
      itemVersion: true,
    },
  });
  if (!row?.auctionVariantId || !row.lastHighBidderId?.trim()) return { settled: false };

  const variantId = row.auctionVariantId;
  const buyerId = row.lastHighBidderId.trim();
  const winUsd = row.currentBidUsd ?? 0;
  if (!Number.isFinite(winUsd) || winUsd < 1) return { settled: false };

  let purchaseId: string | undefined;

  await prisma.$transaction(async (tx) => {
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

    await tx.liveRoomItem.update({
      where: { id: args.itemId },
      data: {
        ...idleVariantSpotCommerceReset(),
        itemVersion: { increment: 1 },
      },
    });
    await tx.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { roomVersion: { increment: 1 } },
    });
  });

  if (!purchaseId) return { settled: false };

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

  emitVariantPurchased(args.liveRoomId, {
    itemId: args.itemId,
    variantId,
    itemVersion: itemNext?.itemVersion ?? 0,
    purchaseId,
    label: purchaseRow?.variant.label ?? "Spot",
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
