import Stripe from "stripe";
import { OrderPaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { assertPaymentMethodOwnedByUser, getBuyerDefaultCardPaymentMethodId } from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { orderRequiresCheckoutForTax } from "@/lib/stripe-tax";
import { resolveCheckoutApplicationFeeCents, resolveLiveRoomIdForOrder } from "@/lib/live-show-gmv";
import {
  finalizeStripeMarketplaceOrderPaid,
  processAuctionPaymentExpiries,
  PAYMENT_EXPIRED,
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REQUIRES_ACTION,
} from "@/services/payments";

export type ChargeOrderSavedPmOutcome =
  | { outcome: "paid" }
  | { outcome: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { outcome: "processing" }
  | { outcome: "error"; code: string };

const PI_KIND = "pay_order_saved_pm" as const;

async function syncLiveBundledShippingOnOrder(orderId: string): Promise<void> {
  const payOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      liveShippingSessionId: true,
      liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
    },
  });
  let shippingPriceUsd = payOrder.shippingPriceUsd;
  if (payOrder.liveShippingSession?.id) {
    const paidOrders = await prisma.order.findMany({
      where: { liveShippingSessionId: payOrder.liveShippingSession.id, paymentStatus: PAYMENT_PAID },
      select: { id: true, shippingPriceUsd: true },
    });
    const alreadyChargedCents = paidOrders
      .filter((o) => o.id !== payOrder.id)
      .reduce((sum, o) => sum + Math.round(Math.max(0, o.shippingPriceUsd) * 100), 0);
    const remainingCents = Math.max(0, payOrder.liveShippingSession.shippingCostCents - alreadyChargedCents);
    shippingPriceUsd = remainingCents / 100;
  }
  if (Math.abs(shippingPriceUsd - payOrder.shippingPriceUsd) > 0.0001) {
    await prisma.order.update({
      where: { id: payOrder.id },
      data: {
        shippingPriceUsd,
        totalUsd: payOrder.itemPriceUsd + shippingPriceUsd + payOrder.taxUsd,
      },
    });
  }
}

async function handleRetrievedPaymentIntent(
  orderId: string,
  pi: Stripe.PaymentIntent,
): Promise<ChargeOrderSavedPmOutcome | null> {
  if (pi.status === "succeeded") {
    await finalizeStripeMarketplaceOrderPaid(orderId, pi.id, null);
    return { outcome: "paid" };
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    const cs = pi.client_secret;
    if (!cs) return { outcome: "error", code: "MISSING_CLIENT_SECRET" };
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_REQUIRES_ACTION, stripePaymentIntentId: pi.id, status: "pending" },
    });
    return { outcome: "requires_action", clientSecret: cs, paymentIntentId: pi.id };
  }
  if (pi.status === "processing") {
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { not: PAYMENT_PAID } },
      data: {
        stripePaymentIntentId: pi.id,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
      },
    });
    return { outcome: "processing" };
  }
  if (pi.status === "canceled" || pi.status === "requires_payment_method") {
    await prisma.order.updateMany({
      where: { id: orderId },
      data: { stripePaymentIntentId: null },
    });
    return null;
  }
  return null;
}

/**
 * Charges an auction-win order using the winning bid’s saved Stripe PaymentMethod (`Order.paymentLabel` = `pm_…`).
 * On-session only (buyer clicked Pay). Does not run at bid placement time.
 */
export async function chargeMarketplaceOrderWithSavedPaymentMethod(args: {
  buyerId: string;
  orderId: string;
}): Promise<ChargeOrderSavedPmOutcome> {
  await processAuctionPaymentExpiries();

  if (!isStripeConfigured()) {
    return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };
  }

  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    include: {
      listing: { select: { id: true, buyingFormat: true, status: true, isCompanyListing: true } },
      seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true } },
      liveShippingSession: { select: { id: true, shippingCostCents: true, liveShowId: true } },
    },
  });

  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_EXPIRED) return { outcome: "error", code: "ORDER_PAYMENT_EXPIRED" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "error", code: "ALREADY_PAID" };
  if (row.paymentMethod === OrderPaymentMethod.escrow) {
    return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  }

  const payable =
    row.paymentStatus === PAYMENT_PENDING ||
    row.paymentStatus === PAYMENT_FAILED ||
    row.paymentStatus === PAYMENT_REQUIRES_ACTION;
  if (!payable) return { outcome: "error", code: "ORDER_NOT_PAYABLE" };

  if (row.paymentDeadlineAt && row.paymentDeadlineAt.getTime() < Date.now()) {
    return { outcome: "error", code: "ORDER_PAYMENT_EXPIRED" };
  }

  const subtotalCheck = row.itemPriceUsd + row.shippingPriceUsd + row.taxUsd;
  const useEscrow = orderTotalQualifiesForEscrow(subtotalCheck) && isEscrowConfigured();
  if (orderTotalQualifiesForEscrow(subtotalCheck) && !isEscrowConfigured()) {
    return { outcome: "error", code: "ESCROW_NOT_CONFIGURED" };
  }
  if (useEscrow) {
    return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  }

  if (row.listing.buyingFormat !== "auction" || row.listing.status !== "awaiting_auction_payment") {
    return { outcome: "error", code: "ORDER_NOT_ELIGIBLE_SAVED_CARD" };
  }

  if (await orderRequiresCheckoutForTax(row.shipState, row.shipCountry)) {
    return { outcome: "error", code: "REQUIRES_CHECKOUT_FOR_TAX" };
  }

  if (!row.seller.stripeAccountId || !row.seller.stripeOnboardingComplete) {
    return { outcome: "error", code: "SELLER_NOT_READY" };
  }

  const pmId = row.paymentLabel?.trim() ?? "";
  if (!isStripePaymentMethodId(pmId)) {
    return { outcome: "error", code: "ORDER_SAVED_PM_MISSING" };
  }

  try {
    await assertPaymentMethodOwnedByUser(args.buyerId, pmId);
  } catch (e) {
    const c = e instanceof Error ? e.message : "";
    if (c === "STRIPE_NOT_CONFIGURED") return { outcome: "error", code: c };
    if (c === "PM_NOT_OWNED" || c === "PM_NOT_FOUND") return { outcome: "error", code: c };
    return { outcome: "error", code: "PM_VALIDATION_FAILED" };
  }

  await syncLiveBundledShippingOnOrder(row.id);

  const buyer = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { stripeCustomerId: true },
  });
  const customerId = buyer?.stripeCustomerId?.trim();
  if (!customerId) {
    return { outcome: "error", code: "BUYER_STRIPE_CUSTOMER_MISSING" };
  }

  const orderFresh = await prisma.order.findUniqueOrThrow({
    where: { id: row.id },
    select: {
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      totalUsd: true,
      stripePaymentIntentId: true,
    },
  });

  const liveRoomId =
    row.liveShippingSession?.liveShowId ?? (await resolveLiveRoomIdForOrder(row.id));
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: orderFresh.itemPriceUsd,
    isCompanyListing: Boolean(row.listing.isCompanyListing),
    liveRoomId,
  });
  const amountCents = Math.round(Math.max(0, orderFresh.totalUsd) * 100);
  if (amountCents < 50) {
    return { outcome: "error", code: "INVALID_ORDER_AMOUNT" };
  }

  const stripe = getStripe();

  if (orderFresh.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(orderFresh.stripePaymentIntentId);
    const handled = await handleRetrievedPaymentIntent(row.id, existing);
    if (handled) return handled;
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: pmId,
        confirmation_method: "automatic",
        confirm: true,
        metadata: {
          orderId: row.id,
          kind: PI_KIND,
          listingId: row.listingId,
        },
        application_fee_amount: feeCents,
        transfer_data: { destination: row.seller.stripeAccountId },
      },
      { idempotencyKey: `pay_order_saved_pm_${row.id}_${amountCents}` },
    );

    const postCreate = await handleRetrievedPaymentIntent(row.id, intent);
    if (postCreate) return postCreate;

    await prisma.order.updateMany({
      where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
      data: { paymentStatus: PAYMENT_FAILED, status: "cancelled" },
    });
    return { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
  } catch (e) {
    await prisma.order
      .updateMany({
        where: { id: row.id, paymentStatus: { not: PAYMENT_PAID } },
        data: { paymentStatus: PAYMENT_FAILED, status: "cancelled", stripePaymentIntentId: null },
      })
      .catch(() => {});
    if (e instanceof Stripe.errors.StripeCardError) {
      return { outcome: "error", code: "CARD_DECLINED" };
    }
    return { outcome: "error", code: "STRIPE_ERROR" };
  }
}

/**
 * Live auction wins often store `paymentLabel` as `"auction"` until charge time.
 * Resolves the buyer’s default (or first) saved `pm_…`, writes it to the order when needed, then runs
 * {@link chargeMarketplaceOrderWithSavedPaymentMethod} (off-session confirm).
 */
export async function chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard(args: {
  buyerId: string;
  orderId: string;
}): Promise<ChargeOrderSavedPmOutcome> {
  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: { paymentLabel: true, paymentStatus: true },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };

  const current = row.paymentLabel?.trim() ?? "";
  if (!isStripePaymentMethodId(current)) {
    const pmId = await getBuyerDefaultCardPaymentMethodId(args.buyerId);
    if (!pmId) {
      return { outcome: "error", code: "NO_SAVED_CARD" };
    }
    const updated = await prisma.order.updateMany({
      where: {
        id: args.orderId,
        buyerId: args.buyerId,
        paymentStatus: PAYMENT_PENDING,
      },
      data: { paymentLabel: pmId },
    });
    if (updated.count === 0) {
      return { outcome: "error", code: "ORDER_NOT_PAYABLE" };
    }
  }
  return chargeMarketplaceOrderWithSavedPaymentMethod(args);
}

/** After `confirmCardPayment` on the client, poll Stripe and finalize when succeeded. */
export async function syncMarketplaceOrderPaymentIntent(args: {
  buyerId: string;
  orderId: string;
}): Promise<ChargeOrderSavedPmOutcome> {
  await processAuctionPaymentExpiries();
  if (!isStripeConfigured()) return { outcome: "error", code: "STRIPE_NOT_CONFIGURED" };

  const row = await prisma.order.findFirst({
    where: { id: args.orderId, buyerId: args.buyerId },
    select: { id: true, paymentStatus: true, stripePaymentIntentId: true, paymentMethod: true },
  });
  if (!row) return { outcome: "error", code: "ORDER_NOT_FOUND" };
  if (row.paymentMethod === OrderPaymentMethod.escrow) return { outcome: "error", code: "USE_ESCROW_CHECKOUT" };
  if (row.paymentStatus === PAYMENT_PAID) return { outcome: "paid" };
  if (!row.stripePaymentIntentId) return { outcome: "error", code: "NO_PAYMENT_INTENT" };

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId);
  const handled = await handleRetrievedPaymentIntent(row.id, pi);
  return handled ?? { outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" };
}
