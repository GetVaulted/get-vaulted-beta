import { createNotification } from "@/lib/notifications";
import { liveRoomBuyerPaymentConfirmedNotification } from "@/lib/live-room-payment-notify-copy";
import { resolveLivePurchaseNotificationChargeUsd } from "@/lib/live-purchase-charge-total";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import { markVariantPurchaseExternalFulfillmentRequired } from "@/services/shipping/break-pyt-fulfillment-bridge";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import { finalizeStripeMarketplaceOrderPaid } from "@/services/payments";
import { releaseReferralCreditReservation } from "@/lib/referral-credit";
import { releasePlatformCreditReservation } from "@/lib/giveaway/platform-credit";
import { prisma } from "@/lib/prisma";
import { isLiveRoomOpenForSpotPurchase } from "@/lib/live-room-commerce-guards";
import {
  emitLiveRoomMessagesRefetch,
  emitLiveRoomQueueItemsChanged,
  emitVariantPurchased,
} from "@/lib/realtime-emit-server";

/** Max spots in one multi-select checkout (PYT has 32 teams). */
export const LIVE_VARIANT_BATCH_MAX_SPOTS = 32;

/** Display title for a multi-spot fulfillment Order. */
export function formatVariantBatchOrderTitle(labels: string[]): string {
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return "Live spots";
  if (cleaned.length === 1) return `Live spot: ${cleaned[0]}`.slice(0, 200);
  if (cleaned.length === 2) return `Live spots: ${cleaned[0]}, ${cleaned[1]}`.slice(0, 200);
  const head = `${cleaned[0]}, ${cleaned[1]}`;
  const rest = cleaned.length - 2;
  return `Live spots: ${head} (+${rest})`.slice(0, 200);
}

/** Celebration / chat label for multiple claimed spots. */
export function formatVariantBatchCelebrationLabel(labels: string[]): string {
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return "Spots";
  if (cleaned.length <= 3) return cleaned.join(" · ");
  return `${cleaned.slice(0, 2).join(" · ")} +${cleaned.length - 2} more`;
}

/**
 * Finalize every pending purchase in a batch after Stripe confirms payment.
 * Order is finalized once; each purchase row is claimed atomically.
 */
export async function finalizeLiveItemVariantPurchaseBatchPaid(
  batchId: string,
  stripePaymentIntentId?: string | null,
  notificationChargeUsd?: number | null,
) {
  const purchases = await prisma.liveItemVariantPurchase.findMany({
    where: { batchId },
    include: {
      variant: { select: { label: true } },
      buyer: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (purchases.length === 0) return;

  const fulfillmentOrderId = purchases.find((p) => p.fulfillmentOrderId)?.fulfillmentOrderId ?? null;
  if (fulfillmentOrderId) {
    try {
      await finalizeStripeMarketplaceOrderPaid(
        fulfillmentOrderId,
        stripePaymentIntentId ?? purchases[0]?.stripePaymentIntentId ?? null,
        null,
      );
    } catch (e) {
      console.error("[variant batch] finalize fulfillment order failed", { batchId, e });
      reportUrgentPaymentAnomaly(
        "live-variant-batch-order-finalize-failed",
        `finalizeStripeMarketplaceOrderPaid threw for a PAID variant batch — purchases will still be marked paid. MANUAL RECONCILIATION REQUIRED. batchId=${batchId} fulfillmentOrderId=${fulfillmentOrderId} error=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const claimedIds: string[] = [];
  for (const purchase of purchases) {
    if (purchase.paymentStatus === "paid") continue;
    const claimed = await prisma.liveItemVariantPurchase.updateMany({
      where: { id: purchase.id, paymentStatus: "pending_payment" },
      data: {
        paymentStatus: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      },
    });
    if (claimed.count > 0) claimedIds.push(purchase.id);
  }
  if (claimedIds.length === 0) return;

  for (const purchase of purchases) {
    if (!claimedIds.includes(purchase.id)) continue;
    const variant = await prisma.liveItemVariant.findUnique({
      where: { id: purchase.variantId },
      select: { quantityRemaining: true },
    });
    if (variant && variant.quantityRemaining <= 0) {
      await prisma.liveItemVariant.update({
        where: { id: purchase.variantId },
        data: { status: "sold_out", isHot: false },
      });
    }
    await markVariantPurchaseExternalFulfillmentRequired(purchase.id);
    void recordBuyerGiveawayPurchaseEntries(purchase.liveRoomId, purchase.buyerId, purchase.id).catch((e) => {
      console.error("[variant batch] buyers giveaway entry", e);
    });
  }

  const primary = purchases[0]!;
  const labels = purchases.map((p) => p.variant.label);
  const itemSumUsd = Math.round(purchases.reduce((s, p) => s + p.totalUsd, 0) * 100) / 100;
  const item = await prisma.liveRoomItem.findUnique({
    where: { id: primary.liveRoomItemId },
    select: { itemVersion: true },
  });
  if (!item) return;

  const celebrationLabel = formatVariantBatchCelebrationLabel(labels);
  emitVariantPurchased(primary.liveRoomId, {
    itemId: primary.liveRoomItemId,
    variantId: primary.variantId,
    purchaseId: primary.id,
    label: celebrationLabel,
    buyerUsername: primary.buyer.username,
    amountUsd: itemSumUsd,
    itemVersion: item.itemVersion,
    quantity: purchases.length,
    labels,
    batchId,
  });

  emitLiveRoomMessagesRefetch(primary.liveRoomId);

  const room = await prisma.liveRoom.findUnique({
    where: { id: primary.liveRoomId },
    select: { sellerId: true },
  });
  if (room?.sellerId) {
    await maybeMarkVariantBreakReady(primary.liveRoomItemId, primary.liveRoomId, room.sellerId);
  }

  if (itemSumUsd > 0) {
    const chargeTotalUsd =
      notificationChargeUsd != null && Number.isFinite(notificationChargeUsd) && notificationChargeUsd > 0
        ? notificationChargeUsd
        : await resolveLivePurchaseNotificationChargeUsd({
            fallbackUsd: itemSumUsd,
            fulfillmentOrderId,
            stripePaymentIntentId: stripePaymentIntentId ?? primary.stripePaymentIntentId,
          });
    const paymentNote = liveRoomBuyerPaymentConfirmedNotification({
      amountUsd: chargeTotalUsd,
      href: "/account/orders?view=live",
    });
    await createNotification(prisma, {
      userId: primary.buyerId,
      ...paymentNote,
    });
  }
}

/** Release every pending purchase in a batch and restore inventory. */
export async function releaseVariantPurchaseBatchOnCheckoutExpired(batchId: string) {
  const purchases = await prisma.liveItemVariantPurchase.findMany({
    where: { batchId, paymentStatus: "pending_payment" },
    select: {
      id: true,
      variantId: true,
      quantity: true,
      liveRoomId: true,
      liveRoomItemId: true,
      fulfillmentOrderId: true,
    },
  });
  if (purchases.length === 0) return;

  const fulfillmentOrderId = purchases.find((p) => p.fulfillmentOrderId)?.fulfillmentOrderId ?? null;
  if (fulfillmentOrderId) {
    releaseReferralCreditReservation(fulfillmentOrderId).catch((e) =>
      console.error("[referral-credit] release failed (variant batch checkout expired)", {
        batchId,
        orderId: fulfillmentOrderId,
        error: e,
      }),
    );
    releasePlatformCreditReservation(fulfillmentOrderId).catch((e) =>
      console.error("[platform-credit] release failed (variant batch checkout expired)", {
        batchId,
        orderId: fulfillmentOrderId,
        error: e,
      }),
    );
  }

  const liveRoomId = purchases[0]!.liveRoomId;
  const liveRoomItemId = purchases[0]!.liveRoomItemId;

  await prisma.$transaction(async (tx) => {
    for (const purchase of purchases) {
      await tx.liveItemVariantPurchase.update({
        where: { id: purchase.id },
        data: {
          paymentStatus: "failed",
          stripeCheckoutSessionId: null,
        },
      });
      const v = await tx.liveItemVariant.findUnique({
        where: { id: purchase.variantId },
        select: { quantityRemaining: true, soldCount: true, quantityInitial: true },
      });
      if (!v) continue;
      const restoredQty = Math.min(v.quantityInitial, v.quantityRemaining + purchase.quantity);
      const restoredSold = Math.max(0, v.soldCount - purchase.quantity);
      await tx.liveItemVariant.update({
        where: { id: purchase.variantId },
        data: {
          quantityRemaining: restoredQty,
          soldCount: restoredSold,
          status: restoredQty > 0 ? "available" : "sold_out",
        },
      });
    }
    await tx.liveRoomItem.update({
      where: { id: liveRoomItemId },
      data: { itemVersion: { increment: 1 } },
    });
  });

  emitLiveRoomQueueItemsChanged(liveRoomId);
}

/** Re-reserve every failed purchase in a batch for payment recovery. */
export async function reopenVariantPurchaseBatchForRecovery(args: {
  batchId: string;
  buyerId: string;
}): Promise<{ reopened: boolean; reason?: string }> {
  const purchases = await prisma.liveItemVariantPurchase.findMany({
    where: { batchId: args.batchId, buyerId: args.buyerId },
    select: {
      id: true,
      paymentStatus: true,
      quantity: true,
      variantId: true,
      liveRoomId: true,
      liveRoomItemId: true,
      liveRoom: { select: { status: true, lockPurchases: true } },
    },
  });
  if (purchases.length === 0) return { reopened: false, reason: "PURCHASE_NOT_FOUND" };
  if (purchases.every((p) => p.paymentStatus === "paid")) return { reopened: true };
  if (purchases.every((p) => p.paymentStatus === "pending_payment")) return { reopened: true };
  if (!purchases.every((p) => p.paymentStatus === "failed" || p.paymentStatus === "pending_payment")) {
    return { reopened: false, reason: "PURCHASE_NOT_PAYABLE" };
  }
  const room = purchases[0]!.liveRoom;
  if (!isLiveRoomOpenForSpotPurchase(room.status)) return { reopened: false, reason: "ROOM_NOT_LIVE" };
  if (room.lockPurchases) return { reopened: false, reason: "PURCHASES_LOCKED" };

  try {
    await prisma.$transaction(async (tx) => {
      for (const purchase of purchases) {
        if (purchase.paymentStatus !== "failed") continue;
        const updated = await tx.liveItemVariant.updateMany({
          where: { id: purchase.variantId, quantityRemaining: { gte: purchase.quantity } },
          data: {
            quantityRemaining: { decrement: purchase.quantity },
            soldCount: { increment: purchase.quantity },
          },
        });
        if (updated.count === 0) {
          throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
        }
        const remaining = await tx.liveItemVariant.findUnique({
          where: { id: purchase.variantId },
          select: { quantityRemaining: true },
        });
        if (remaining && remaining.quantityRemaining <= 0) {
          await tx.liveItemVariant.update({
            where: { id: purchase.variantId },
            data: { status: "sold_out", isHot: false },
          });
        }
        await tx.liveItemVariantPurchase.update({
          where: { id: purchase.id },
          data: { paymentStatus: "pending_payment" },
        });
      }
      await tx.liveRoomItem.update({
        where: { id: purchases[0]!.liveRoomItemId },
        data: { itemVersion: { increment: 1 } },
      });
    });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "SOLD_OUT") return { reopened: false, reason: "SOLD_OUT" };
    throw e;
  }

  emitLiveRoomQueueItemsChanged(purchases[0]!.liveRoomId);
  return { reopened: true };
}
