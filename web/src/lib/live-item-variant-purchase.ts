import { prisma } from "@/lib/prisma";
import { isLiveRoomOpenForSpotPurchase } from "@/lib/live-room-commerce-guards";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { sanitizeStripePaymentIntentId } from "@/lib/stripe-payment-intent-id";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { buildCheckoutTaxSessionFields, STRIPE_TAX_CODE_TANGIBLE, stripeLineItemProductData } from "@/lib/stripe-tax";
import { recordLiveShowCompletedSaleTx, resolveCheckoutApplicationFeeCents } from "@/lib/live-show-gmv";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import { assertSellerStripeCollectReadyFromUser, sellerStripeCollectSelect } from "@/lib/seller-stripe-collect-ready";

import {
  emitLiveRoomMessageById,
  emitLiveRoomMessagesRefetch,
  emitLiveRoomQueueItemsChanged,
  emitVariantPurchased,
} from "@/lib/realtime-emit-server";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";
import { createNotification } from "@/lib/notifications";
import { liveRoomBuyerPaymentConfirmedNotification } from "@/lib/live-room-payment-notify-copy";
import { resolveLivePurchaseNotificationChargeUsd } from "@/lib/live-purchase-charge-total";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import {
  executeRandomVariantRevealOnPurchase,
  isRandomVariantAssignment,
} from "@/lib/live-item-variant-random-reveal";
import { markVariantPurchaseExternalFulfillmentRequired } from "@/services/shipping/break-pyt-fulfillment-bridge";
import { finalizeStripeMarketplaceOrderPaid, PAYMENT_REFUNDED } from "@/services/payments";
import { executeOrderRefund } from "@/services/order-refund-request";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "@/lib/order-refund-eligibility";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";
import { OrderRefundRequestKind, OrderRefundRequestStatus } from "@/generated/prisma/enums";
import { releaseStoreCreditAndRestoreOrder } from "@/lib/store-credit-release";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Safety net for FIX 3: a buyer was already charged for a random-reveal purchase but no label could
 * be assigned (pool exhausted, or every draw attempt lost the DB-level race — see
 * `executeRandomVariantRevealOnPurchase`). This must never silently leave the buyer charged with
 * nothing. Prefer an automatic refund via the existing order-refund service; if that isn't possible
 * (no linked fulfillment order yet) or itself fails, fire a loud, actionable alert so ops can refund
 * manually.
 */
async function refundOrAlertOnFailedRandomReveal(purchase: {
  id: string;
  fulfillmentOrderId: string | null;
  liveRoomId: string;
  liveRoomItemId: string;
  buyerId: string;
  totalUsd: number;
}): Promise<void> {
  const context = `purchaseId=${purchase.id} liveRoomId=${purchase.liveRoomId} liveRoomItemId=${purchase.liveRoomItemId} buyerId=${purchase.buyerId} totalUsd=${purchase.totalUsd} fulfillmentOrderId=${purchase.fulfillmentOrderId ?? "none"}`;

  if (purchase.totalUsd <= 0) return; // Nothing was charged — no refund needed.

  if (!purchase.fulfillmentOrderId) {
    reportUrgentPaymentAnomaly(
      "live-random-reveal-unassignable",
      `Random-reveal pool exhausted for a PAID purchase with no fulfillment order to auto-refund. Buyer was charged with NO team/division assigned. MANUAL REFUND REQUIRED. ${context}`,
    );
    return;
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: purchase.fulfillmentOrderId },
      select: { id: true, buyerId: true, sellerId: true, paymentStatus: true },
    });
    if (!order) throw new Error("FULFILLMENT_ORDER_NOT_FOUND");
    if (order.paymentStatus === PAYMENT_REFUNDED) return; // Already refunded (e.g. a prior alert was handled).

    const activeStatuses = [...ACTIVE_REFUND_REQUEST_STATUSES] as OrderRefundRequestStatus[];
    const existingActive = await prisma.orderRefundRequest.findFirst({
      where: { orderId: order.id, status: { in: activeStatuses } },
      orderBy: { createdAt: "desc" },
    });

    const refundRequestId =
      existingActive?.id ??
      (
        await prisma.orderRefundRequest.create({
          data: {
            orderId: order.id,
            kind: OrderRefundRequestKind.cancel,
            status: OrderRefundRequestStatus.pending_seller,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            reason: `Automatic refund: the random-reveal pool was exhausted after payment for purchase ${purchase.id} — buyer was charged with no team/division assigned.`,
            sellerDirect: true,
          },
        })
      ).id;

    await executeOrderRefund(order.id, refundRequestId);
    reportUrgentPaymentAnomaly(
      "live-random-reveal-auto-refunded",
      `Auto-refunded a purchase after the random-reveal pool was exhausted post-payment. Verify buyer/seller were notified correctly. ${context}`,
    );
  } catch (e) {
    reportUrgentPaymentAnomaly(
      "live-random-reveal-refund-failed",
      `Random-reveal pool was exhausted for a PAID purchase AND the automatic refund attempt FAILED (${e instanceof Error ? e.message : String(e)}). MANUAL REFUND REQUIRED. ${context}`,
    );
  }
}

export async function finalizeLiveItemVariantPurchasePaid(
  purchaseId: string,
  rawStripePaymentIntentId?: string | null,
  notificationChargeUsd?: number | null,
) {
  // Guard (bug #18): the PayPal/Venmo buyer rail (see live-payment-pipeline.ts) returns a PayPal
  // capture id through the same "paymentIntentId" slot used by the real Stripe rail. Only a
  // Stripe-shaped id (`pi_…`) is ever allowed past this point.
  const stripePaymentIntentId = sanitizeStripePaymentIntentId(rawStripePaymentIntentId);
  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      variant: { select: { label: true } },
      buyer: { select: { id: true, username: true } },
    },
  });
  if (!purchase) return;

  if (purchase.fulfillmentOrderId) {
    try {
      await finalizeStripeMarketplaceOrderPaid(
        purchase.fulfillmentOrderId,
        stripePaymentIntentId ?? sanitizeStripePaymentIntentId(purchase.stripePaymentIntentId),
        null,
      );
    } catch (e) {
      // FIX 4: the buyer's variant purchase is about to be marked "paid" below regardless (Stripe
      // already confirmed the charge, so we can't safely roll that back) — but if the linked Order
      // never got marked paid, that's a serious buyer-paid/order-unpaid inconsistency that must not
      // be silently swallowed. Alert loudly so ops can manually reconcile the Order.
      console.error("[variant purchase] finalize fulfillment order failed", { purchaseId, e });
      reportUrgentPaymentAnomaly(
        "live-variant-purchase-order-finalize-failed",
        `finalizeStripeMarketplaceOrderPaid threw for a PAID variant purchase — the purchase will still be marked paid (Stripe already charged the buyer) but the linked Order may remain unpaid. MANUAL RECONCILIATION REQUIRED. purchaseId=${purchaseId} fulfillmentOrderId=${purchase.fulfillmentOrderId} error=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Atomic compare-and-swap: this function is invoked from multiple independent triggers for the
  // same purchase — `settleLiveItemVariantPurchase`'s direct call and the Stripe
  // `payment_intent.succeeded` webhook — which can race in after both reading `paymentStatus` as
  // `pending_payment`. A plain read-then-write here would let both callers run every side effect
  // below, most importantly both drawing a random reveal label (compounding the pool-draw race in
  // `executeRandomVariantRevealOnPurchase`) and double-sending buyer/seller notifications. Only the
  // caller whose `updateMany` actually flips the row wins the claim; the loser (`count === 0`,
  // meaning the row was already `paid` — or something else — when this ran) returns early and skips
  // every side effect below. Mirrors the marketplace order finalize pattern in `services/payments.ts`.
  const claimed = await prisma.liveItemVariantPurchase.updateMany({
    where: { id: purchaseId, paymentStatus: "pending_payment" },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
    },
  });
  if (claimed.count === 0) return;

  const variant = await prisma.liveItemVariant.findUnique({
    where: { id: purchase.variantId },
    select: { quantityRemaining: true, liveRoomItemId: true },
  });
  if (variant && variant.quantityRemaining <= 0) {
    await prisma.liveItemVariant.update({
      where: { id: purchase.variantId },
      data: { status: "sold_out", isHot: false },
    });
  }

  // `finalizeStripeMarketplaceOrderPaid` above already records live-show completed-sale GMV for
  // the linked fulfillment order (same dollar amount as `purchase.totalUsd`). Only record here
  // directly when there is no fulfillment order (legacy/no-fulfillment path), otherwise this
  // double-counts GMV and skews live fee-tier calculations.
  if (!purchase.fulfillmentOrderId && purchase.totalUsd > 0) {
    await prisma.$transaction(async (tx) => {
      await recordLiveShowCompletedSaleTx(tx, purchase.liveRoomId, purchase.totalUsd);
    });
  }

  await markVariantPurchaseExternalFulfillmentRequired(purchaseId);

  const itemRow = await prisma.liveRoomItem.findUnique({
    where: { id: purchase.liveRoomItemId },
    select: { itemVersion: true, title: true, salesFormat: true, variantAssignmentMode: true },
  });

  let displayLabel = purchase.variant.label;
  let randomReveal = false;

  if (itemRow && isRandomVariantAssignment(itemRow.variantAssignmentMode)) {
    const revealed = await executeRandomVariantRevealOnPurchase({
      purchaseId: purchase.id,
      liveRoomId: purchase.liveRoomId,
      liveRoomItemId: purchase.liveRoomItemId,
      buyerUsername: purchase.buyer.username,
      itemTitle: itemRow.title,
      salesFormat: itemRow.salesFormat,
    });
    if (revealed) {
      displayLabel = revealed.label;
      randomReveal = true;
    } else {
      // Charged but no label could be assigned (pool exhausted / every draw attempt lost the race).
      // Never leave this silent — refund automatically or alert loudly for manual refund (FIX 3).
      await refundOrAlertOnFailedRandomReveal({
        id: purchase.id,
        fulfillmentOrderId: purchase.fulfillmentOrderId,
        liveRoomId: purchase.liveRoomId,
        liveRoomItemId: purchase.liveRoomItemId,
        buyerId: purchase.buyerId,
        totalUsd: purchase.totalUsd,
      });
      // FIX 2: this purchase is being auto-refunded (or flagged for manual refund) — it must NOT
      // proceed through the "purchase succeeded" side effects below (live-room purchase broadcast,
      // buyer "payment confirmed" notification, giveaway entries, break-ready marking), since none of
      // that is true for a purchase with no assigned label. Bookkeeping that already ran above
      // (inventory/sold-out status, linked-order finalize, GMV recording, external-fulfillment
      // marking) is unaffected since it happened before this branch and is independent of the reveal
      // outcome.
      return;
    }
  }

  const item = await prisma.liveRoomItem.findUnique({
    where: { id: purchase.liveRoomItemId },
    select: { itemVersion: true },
  });
  if (!item) return;

  const paidMeta = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      fulfillmentOrderId: true,
      stripePaymentIntentId: true,
      totalUsd: true,
    },
  });
  const chargeTotalUsd =
    notificationChargeUsd != null && Number.isFinite(notificationChargeUsd) && notificationChargeUsd > 0
      ? notificationChargeUsd
      : await resolveLivePurchaseNotificationChargeUsd({
          fallbackUsd: paidMeta?.totalUsd ?? purchase.totalUsd,
          fulfillmentOrderId: paidMeta?.fulfillmentOrderId ?? purchase.fulfillmentOrderId,
          stripePaymentIntentId:
            stripePaymentIntentId ??
            sanitizeStripePaymentIntentId(paidMeta?.stripePaymentIntentId ?? purchase.stripePaymentIntentId),
        });

  emitVariantPurchased(purchase.liveRoomId, {
    itemId: purchase.liveRoomItemId,
    variantId: purchase.variantId,
    purchaseId: purchase.id,
    label: displayLabel,
    buyerUsername: purchase.buyer.username,
    amountUsd: chargeTotalUsd,
    itemVersion: item.itemVersion,
    quantity: purchase.quantity,
    randomReveal,
  });

  const room = await prisma.liveRoom.findUnique({
    where: { id: purchase.liveRoomId },
    select: { sellerId: true },
  });

  if (randomReveal && room?.sellerId && displayLabel.trim()) {
    const username = purchase.buyer.username.replace(/^@+/, "").trim() || "Buyer";
    const revealMsg = await prisma.liveRoomMessage.create({
      data: {
        liveRoomId: purchase.liveRoomId,
        senderId: room.sellerId,
        body: `@${username} got ${displayLabel.trim()}`,
        messageType: "system",
      },
    });
    await emitLiveRoomMessageById(revealMsg.id);
  }

  emitLiveRoomMessagesRefetch(purchase.liveRoomId);
  void recordBuyerGiveawayPurchaseEntries(purchase.liveRoomId, purchase.buyerId, purchase.id).catch((e) => {
    console.error("[variant purchase] buyers giveaway entry", e);
  });

  if (room?.sellerId) {
    await maybeMarkVariantBreakReady(purchase.liveRoomItemId, purchase.liveRoomId, room.sellerId);
  }

  if (purchase.totalUsd > 0) {
    const paymentNote = liveRoomBuyerPaymentConfirmedNotification({
      amountUsd: chargeTotalUsd,
      href: "/account/orders?view=live",
    });
    await createNotification(prisma, {
      userId: purchase.buyerId,
      ...paymentNote,
    });
  }
}

export async function releaseVariantPurchaseOnCheckoutExpired(purchaseId: string) {
  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      paymentStatus: true,
      variantId: true,
      quantity: true,
      liveRoomId: true,
      liveRoomItemId: true,
      fulfillmentOrderId: true,
    },
  });
  if (!purchase || purchase.paymentStatus !== "pending_payment") return;

  if (purchase.fulfillmentOrderId) {
    releaseStoreCreditAndRestoreOrder(purchase.fulfillmentOrderId).catch((e) =>
      console.error("[store-credit] release failed (variant purchase checkout expired)", {
        purchaseId,
        orderId: purchase.fulfillmentOrderId,
        error: e,
      }),
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.liveItemVariantPurchase.update({
      where: { id: purchaseId },
      data: {
        paymentStatus: "failed",
        stripeCheckoutSessionId: null,
        // Keep stripePaymentIntentId so recovery can cancel the dead intent and mint a fresh charge.
      },
    });
    const v = await tx.liveItemVariant.findUnique({
      where: { id: purchase.variantId },
      select: { quantityRemaining: true, soldCount: true, quantityInitial: true },
    });
    if (!v) return;
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
    await tx.liveRoomItem.update({
      where: { id: purchase.liveRoomItemId },
      data: { itemVersion: { increment: 1 } },
    });
  });

  emitLiveRoomQueueItemsChanged(purchase.liveRoomId);
}

/**
 * Re-reserve a variant spot and reopen a failed purchase for payment recovery retry.
 * After checkout prep/charge failure we mark the purchase failed and release inventory;
 * retry must restore both before charging again.
 */
export async function reopenVariantPurchaseForRecovery(args: {
  purchaseId: string;
  buyerId: string;
}): Promise<{ reopened: boolean; reason?: string }> {
  const purchase = await prisma.liveItemVariantPurchase.findFirst({
    where: { id: args.purchaseId, buyerId: args.buyerId },
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
  if (!purchase) return { reopened: false, reason: "PURCHASE_NOT_FOUND" };
  if (purchase.paymentStatus === "paid") return { reopened: true };
  if (purchase.paymentStatus === "pending_payment") return { reopened: true };
  if (purchase.paymentStatus !== "failed") {
    return { reopened: false, reason: "PURCHASE_NOT_PAYABLE" };
  }
  if (!isLiveRoomOpenForSpotPurchase(purchase.liveRoom.status)) {
    return { reopened: false, reason: "ROOM_NOT_LIVE" };
  }
  if (purchase.liveRoom.lockPurchases) {
    return { reopened: false, reason: "PURCHASES_LOCKED" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reserved = await tx.liveItemVariant.updateMany({
        where: { id: purchase.variantId, quantityRemaining: { gte: purchase.quantity } },
        data: {
          quantityRemaining: { decrement: purchase.quantity },
          soldCount: { increment: purchase.quantity },
        },
      });
      if (reserved.count === 0) {
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
        data: {
          paymentStatus: "pending_payment",
          stripeCheckoutSessionId: null,
          paidAt: null,
        },
      });

      await tx.liveRoomItem.update({
        where: { id: purchase.liveRoomItemId },
        data: { itemVersion: { increment: 1 } },
      });
    });
    emitLiveRoomQueueItemsChanged(purchase.liveRoomId);
    return { reopened: true };
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "SOLD_OUT" || (e instanceof Error && e.message === "SOLD_OUT")) {
      return { reopened: false, reason: "SPOT_UNAVAILABLE" };
    }
    throw e;
  }
}

/** @deprecated Live variant purchases use saved-card instant charge — kept for legacy Checkout session webhook cleanup. */
export async function createLiveItemVariantCheckoutSession(args: {
  userId: string;
  purchaseId: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string }> {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  const stripe = getStripe();
  const base = siteUrl();

  const purchase = await prisma.liveItemVariantPurchase.findFirst({
    where: { id: args.purchaseId, buyerId: args.userId },
    include: {
      variant: { select: { label: true } },
      liveRoom: { select: { id: true, sellerId: true, status: true } },
    },
  });
  if (!purchase || purchase.totalUsd <= 0) throw new Error("PURCHASE_INVALID");
  if (!isLiveRoomOpenForSpotPurchase(purchase.liveRoom.status)) throw new Error("ROOM_NOT_LIVE");
  if (purchase.paymentStatus === "paid") throw new Error("ALREADY_PAID");

  const seller = await prisma.user.findUnique({
    where: { id: purchase.liveRoom.sellerId },
    select: sellerStripeCollectSelect,
  });
  assertSellerStripeCollectReadyFromUser(seller);
  const stripeAccountId = seller?.stripeAccountId?.trim();
  if (!stripeAccountId) throw new Error("STRIPE_ONBOARDING_REQUIRED");

  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: purchase.totalUsd,
    isCompanyListing: false,
    liveRoomId: purchase.liveRoomId,
    sellerId: purchase.liveRoom.sellerId,
  });

  const taxFields = await buildCheckoutTaxSessionFields({
    buyerId: args.userId,
    collectShippingAddress: true,
  });

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ...stripeCheckoutSessionPaymentOptions("live"),
      success_url: `${base}${args.successPath ?? `/live/${encodeURIComponent(purchase.liveRoomId)}`}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${args.cancelPath ?? `/live/${encodeURIComponent(purchase.liveRoomId)}`}`,
      ...taxFields,
      metadata: {
        kind: "variant_purchase",
        purchaseId: purchase.id,
        variantId: purchase.variantId,
        liveRoomId: purchase.liveRoomId,
        userId: args.userId,
      },
      payment_intent_data: {
        // Seller absorbs Stripe processing (2.9% + $0.30). Tax is added by Stripe at checkout
        // (automatic_tax) so it isn't known here — estimate processing on the spot subtotal.
        application_fee_amount:
          feeCents +
          (feeCents > 0 ? estimateStripeProcessingFeeCents(Math.round(purchase.totalUsd * 100)) : 0),
        transfer_data: { destination: stripeAccountId },
        metadata: { purchaseId: purchase.id, kind: "variant_purchase" },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(purchase.totalUsd * 100),
            tax_behavior: "exclusive",
            product_data: stripeLineItemProductData(
              `Live spot: ${purchase.variant.label}`,
              STRIPE_TAX_CODE_TANGIBLE,
            ),
          },
        },
      ],
    },
    { idempotencyKey: `variant_purchase_${purchase.id}` },
  );

  if (!session.url) throw new Error("NO_CHECKOUT_URL");

  await prisma.liveItemVariantPurchase.update({
    where: { id: purchase.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return { url: session.url };
}
