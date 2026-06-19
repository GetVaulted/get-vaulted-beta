import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { buildCheckoutTaxSessionFields, STRIPE_TAX_CODE_TANGIBLE, stripeLineItemProductData } from "@/lib/stripe-tax";
import { recordLiveShowCompletedSaleTx, resolveCheckoutApplicationFeeCents } from "@/lib/live-show-gmv";

import { emitLiveRoomMessagesRefetch, emitVariantPurchased } from "@/lib/realtime-emit-server";
import { recordBuyerGiveawayPurchaseEntries } from "@/lib/live-giveaway";
import { createNotification } from "@/lib/notifications";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import {
  executeRandomVariantRevealOnPurchase,
  isRandomVariantAssignment,
} from "@/lib/live-item-variant-random-reveal";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function finalizeLiveItemVariantPurchasePaid(purchaseId: string, stripePaymentIntentId?: string | null) {
  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      variant: { select: { label: true } },
      buyer: { select: { id: true, username: true } },
    },
  });
  if (!purchase || purchase.paymentStatus === "paid") return;

  await prisma.liveItemVariantPurchase.update({
    where: { id: purchaseId },
    data: {
      paymentStatus: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: stripePaymentIntentId ?? undefined,
    },
  });

  const variant = await prisma.liveItemVariant.findUnique({
    where: { id: purchase.variantId },
    select: { quantityRemaining: true, liveRoomItemId: true },
  });
  if (variant && variant.quantityRemaining <= 0) {
    await prisma.liveItemVariant.update({
      where: { id: purchase.variantId },
      data: { status: "sold_out" },
    });
  }

  if (purchase.totalUsd > 0) {
    await prisma.$transaction(async (tx) => {
      await recordLiveShowCompletedSaleTx(tx, purchase.liveRoomId, purchase.totalUsd);
    });
  }

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
    }
  }

  const item = await prisma.liveRoomItem.update({
    where: { id: purchase.liveRoomItemId },
    data: { itemVersion: { increment: 1 } },
    select: { itemVersion: true },
  });

  emitVariantPurchased(purchase.liveRoomId, {
    itemId: purchase.liveRoomItemId,
    variantId: purchase.variantId,
    purchaseId: purchase.id,
    label: displayLabel,
    buyerUsername: purchase.buyer.username,
    amountUsd: purchase.totalUsd,
    itemVersion: item.itemVersion,
    randomReveal,
  });
  emitLiveRoomMessagesRefetch(purchase.liveRoomId);
  void recordBuyerGiveawayPurchaseEntries(purchase.liveRoomId, purchase.buyerId, purchase.id).catch((e) => {
    console.error("[variant purchase] buyers giveaway entry", e);
  });

  const room = await prisma.liveRoom.findUnique({
    where: { id: purchase.liveRoomId },
    select: { sellerId: true },
  });
  if (room?.sellerId) {
    await maybeMarkVariantBreakReady(purchase.liveRoomItemId, purchase.liveRoomId, room.sellerId);
  }

  await createNotification(prisma, {
    userId: purchase.buyerId,
    type: "break_spot_paid",
    title: randomReveal ? "Team revealed!" : "Spot confirmed",
    body: randomReveal
      ? `You got ${displayLabel}!`
      : `Payment confirmed for ${displayLabel}.`,
    href: `/live/${encodeURIComponent(purchase.liveRoomId)}`,
  });
}

export async function releaseVariantPurchaseOnCheckoutExpired(purchaseId: string) {
  const purchase = await prisma.liveItemVariantPurchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, paymentStatus: true, variantId: true, quantity: true },
  });
  if (!purchase || purchase.paymentStatus !== "pending_payment") return;

  await prisma.$transaction(async (tx) => {
    await tx.liveItemVariantPurchase.update({
      where: { id: purchaseId },
      data: { paymentStatus: "failed", stripeCheckoutSessionId: null },
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
  });
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
  if (purchase.liveRoom.status !== "live") throw new Error("ROOM_NOT_LIVE");
  if (purchase.paymentStatus === "paid") throw new Error("ALREADY_PAID");

  const seller = await prisma.user.findUnique({
    where: { id: purchase.liveRoom.sellerId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!seller?.stripeAccountId || !seller.stripeOnboardingComplete) throw new Error("SELLER_NOT_READY");

  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: purchase.totalUsd,
    isCompanyListing: false,
    liveRoomId: purchase.liveRoomId,
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
        application_fee_amount: feeCents,
        transfer_data: { destination: seller.stripeAccountId },
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
