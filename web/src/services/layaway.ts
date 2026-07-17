import type Stripe from "stripe";
import type { LayawayPlanType } from "@/generated/prisma/client";
import { LayawayPaymentKind, LayawayStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { createNotification } from "@/lib/notifications";
import { emitLayawayLifecycleSync, emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { logLayawayAudit } from "@/lib/layaway/audit";
import {
  LAYAWAY_PLAN_DAYS,
  PAYMENT_LAYAWAY_ACTIVE,
  type LayawayPlanKey,
} from "@/lib/layaway/constants";
import {
  buyerHasActiveLayaway,
  isValidLayawayPlan,
  listingSupportsLayawayCheckout,
} from "@/lib/layaway/eligibility";
import {
  assertLayawayStartAllowed,
  CommerceGuardError,
  loadListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";
import {
  layawayDepositUsd,
  layawayRefundableAboveDepositUsd,
  layawayRemainingBalanceUsd,
  roundUsd,
} from "@/lib/layaway/math";
import {
  consumeListingInventoryHoldTx,
  releaseActiveInventoryHoldsForListingAndBuyerTx,
  reserveListingInventoryHoldTx,
} from "@/lib/live-auction-inventory-hold";
import { marketplacePlatformFeePercent, applicationFeeCentsFromSubtotalUsd } from "@/lib/platform-fee-policy";
import { resolveCheckoutApplicationFeeCents } from "@/lib/live-show-gmv";
import { getStripe } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import {
  connectCheckoutPaymentIntentData,
  estimateSalesTaxCents,
  fetchCheckoutSessionTax,
  loadSellerShipFromForTax,
  recordStripeTaxTransaction,
  stripeLineItemProductData,
  STRIPE_TAX_CODE_TANGIBLE,
} from "@/lib/stripe-tax";
import { buildOrderTaxPersistFields, orderTaxUpdateData } from "@/lib/sales-tax-order";
import { prisma } from "@/lib/prisma";
import { grantReferralCreditsForQualifyingOrder } from "@/lib/referral-credit";
import { PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";
import { initializeOrderPayoutOnPayment } from "@/services/payout/process-delivery-payout";
import { resolveMarketplaceCheckoutShipping } from "@/services/marketplace-checkout-shipping";

export type LayawayShippingInput = {
  buyerAddressId?: string | null;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  selectedShippingRateId?: string | null;
};

function siteUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!base) throw new Error("SITE_URL_NOT_CONFIGURED");
  return base.replace(/\/+$/, "");
}

function emitLayawayEcosystem(
  type: Parameters<typeof emitLayawayLifecycleSync>[0]["typedEvent"],
  lay: { id: string; sellerId: string; buyerId: string; listingId?: string; orderId?: string },
  payload?: Record<string, unknown>,
): void {
  if (!lay.listingId || !lay.orderId) return;
  emitLayawayLifecycleSync({
    typedEvent: type,
    layawayId: lay.id,
    parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
    listingId: lay.listingId,
    orderId: lay.orderId,
    layawayStatus: typeof payload?.status === "string" ? payload.status : "active",
    listingStatus: typeof payload?.listingStatus === "string" ? payload.listingStatus : undefined,
    orderStatus: typeof payload?.orderStatus === "string" ? payload.orderStatus : undefined,
    paymentStatus: typeof payload?.paymentStatus === "string" ? payload.paymentStatus : undefined,
    extraPayload: payload,
  });
}

/** Close in-progress layaways on a listing when a marketplace purchase finalizes. */
export async function closeActiveLayawaysSupersededByMarketplacePurchaseTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  args: { listingId: string; winningOrderId: string; winningBuyerId: string },
): Promise<Array<{ id: string; sellerId: string; buyerId: string; listingId: string; orderId: string }>> {
  const active = await tx.layaway.findMany({
    where: { listingId: args.listingId, status: LayawayStatus.active },
    select: { id: true, sellerId: true, buyerId: true, listingId: true, orderId: true },
  });
  const closed: Array<{ id: string; sellerId: string; buyerId: string; listingId: string; orderId: string }> = [];
  for (const lay of active) {
    const sameWinningOrder = lay.orderId === args.winningOrderId;
    await tx.layaway.update({
      where: { id: lay.id },
      data: sameWinningOrder
        ? {
            status: LayawayStatus.completed,
            completedAt: new Date(),
            remainingBalanceUsd: 0,
          }
        : {
            status: LayawayStatus.refunded,
            remainingBalanceUsd: 0,
          },
    });
    if (!sameWinningOrder) {
      await tx.order.update({
        where: { id: lay.orderId },
        data: { paymentStatus: "cancelled", status: "cancelled" },
      });
    }
    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "superseded_by_purchase",
      actorUserId: args.winningBuyerId,
      metadata: { winningOrderId: args.winningOrderId },
    });
    closed.push(lay);
  }
  return closed;
}

/**
 * Refund every collected payment (deposit + installments) for a layaway that was superseded by
 * another buyer's purchase — the buyer is not at fault (unlike a default), so the deposit
 * forfeiture policy does not apply here; the full amount paid so far must come back.
 * Call AFTER the enclosing transaction commits (Stripe calls should not live inside a DB tx).
 */
export async function refundSupersededLayawayPayments(layawayId: string): Promise<void> {
  const paid = await prisma.layawayPayment.findMany({
    where: { layawayId, status: "paid", stripePaymentIntentId: { not: null } },
    orderBy: { paidAt: "asc" },
  });
  if (paid.length === 0) return;

  const stripe = getStripe();
  for (const pay of paid) {
    try {
      await stripe.refunds.create({
        payment_intent: pay.stripePaymentIntentId!,
        // Full refund of this payment; each installment was a destination charge that already
        // transferred (item - fee) to the seller, so reclaim it rather than debiting the
        // platform's own balance for a sale that never completed.
        reverse_transfer: true,
        metadata: { layawayId, layawayPaymentId: pay.id, kind: "layaway_superseded_refund" },
      }, { idempotencyKey: `layaway_superseded_refund_${pay.id}` });
    } catch (e) {
      console.error("[layaway] superseded-payment refund failed", pay.id, e);
    }
  }
  await prisma.$transaction(async (tx) => {
    await logLayawayAudit(tx, {
      layawayId,
      action: "refund_issued",
      metadata: { reason: "superseded_by_purchase", paymentsRefunded: paid.length },
    });
  });
}

/** Repair layaway rows left active after listing sold or order paid (e.g. legacy buy-now paths). */
export async function repairStaleActiveLayaways(limit = 50): Promise<number> {
  const stale = await prisma.layaway.findMany({
    where: {
      status: LayawayStatus.active,
      OR: [
        { listing: { status: "sold" } },
        { order: { paymentStatus: PAYMENT_PAID } },
        { listing: { orders: { some: { paymentStatus: PAYMENT_PAID } } } },
      ],
    },
    select: {
      id: true,
      sellerId: true,
      buyerId: true,
      listingId: true,
      orderId: true,
      order: { select: { paymentStatus: true } },
      listing: { select: { status: true, orders: { select: { paymentStatus: true } } } },
    },
    take: limit,
  });

  let repaired = 0;
  for (const lay of stale) {
    const listingPaidOrder = lay.listing.orders.some((o) => o.paymentStatus === PAYMENT_PAID);
    const orderPaid = lay.order.paymentStatus === PAYMENT_PAID || listingPaidOrder;
    const listingSold = lay.listing.status === "sold";
    if (!orderPaid && !listingSold) continue;

    await prisma.$transaction(async (tx) => {
      if (listingPaidOrder && lay.listing.status !== "sold") {
        await tx.listing.updateMany({
          where: { id: lay.listingId, status: { in: ["active", "layaway_reserved"] } },
          data: { status: "sold" },
        });
      }
      if (orderPaid) {
        await tx.layaway.update({
          where: { id: lay.id, status: LayawayStatus.active },
          data: {
            status: LayawayStatus.completed,
            completedAt: new Date(),
            remainingBalanceUsd: 0,
          },
        });
        await logLayawayAudit(tx, {
          layawayId: lay.id,
          action: "completion",
          metadata: { source: "repair_stale_active_layaway", orderPaid: true },
        });
      } else {
        await tx.layaway.update({
          where: { id: lay.id, status: LayawayStatus.active },
          data: { status: LayawayStatus.refunded, remainingBalanceUsd: 0 },
        });
        await logLayawayAudit(tx, {
          layawayId: lay.id,
          action: "superseded_by_purchase",
          metadata: { source: "repair_stale_active_layaway", listingSold: true },
        });
      }
    });

    const layParties = {
      id: lay.id,
      sellerId: lay.sellerId,
      buyerId: lay.buyerId,
      listingId: lay.listingId,
      orderId: lay.orderId,
    };
    if (orderPaid) {
      emitLayawayEcosystem("layaway_paid_in_full", layParties, {
        status: "completed",
        listingStatus: "sold",
        orderStatus: "paid",
        paymentStatus: PAYMENT_PAID,
        repaired: true,
      });
      emitOrderLifecycleSync({
        orderId: lay.orderId,
        parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
        listingId: lay.listingId,
        layawayId: lay.id,
        orderStatus: "paid",
        paymentStatus: PAYMENT_PAID,
        listingStatus: "sold",
        extraPayload: { repaired: true },
      });
    } else {
      emitLayawayEcosystem("layaway_canceled", layParties, {
        status: "canceled",
        listingStatus: "sold",
        superseded: true,
        repaired: true,
      });
    }
    repaired += 1;
  }
  return repaired;
}

/** Repair listings with paid orders that were not marked sold, then close conflicting layaways. */
export async function repairListingCommerceConflicts(limit = 50): Promise<{ listingsFixed: number; layawaysFixed: number }> {
  const unsoldPaid = await prisma.listing.findMany({
    where: {
      status: { in: ["active", "layaway_reserved"] },
      orders: { some: { paymentStatus: PAYMENT_PAID } },
    },
    select: { id: true },
    take: limit,
  });

  let listingsFixed = 0;
  for (const listing of unsoldPaid) {
    const updated = await prisma.listing.updateMany({
      where: { id: listing.id, status: { in: ["active", "layaway_reserved"] } },
      data: { status: "sold" },
    });
    listingsFixed += updated.count;
  }

  const layawaysFixed = await repairStaleActiveLayaways(limit);
  return { listingsFixed, layawaysFixed };
}

/** Cancel layaway checkout abandoned before deposit payment; restore listing availability. */
export async function cancelAbandonedLayawayCheckout(args: {
  layawayId?: string | null;
  orderId?: string | null;
  listingId?: string | null;
}): Promise<boolean> {
  const lay = args.layawayId
    ? await prisma.layaway.findUnique({
        where: { id: args.layawayId },
        include: {
          listing: {
            select: {
              id: true,
              status: true,
              allowOffers: true,
              acceptTradeOffers: true,
            },
          },
          order: { select: { id: true, paymentStatus: true, paymentMethod: true } },
        },
      })
    : args.orderId
      ? await prisma.layaway.findFirst({
          where: { orderId: args.orderId },
          include: {
            listing: {
              select: {
                id: true,
                status: true,
                allowOffers: true,
                acceptTradeOffers: true,
              },
            },
            order: { select: { id: true, paymentStatus: true, paymentMethod: true } },
          },
        })
      : null;

  if (!lay || lay.status !== LayawayStatus.active) return false;
  if (lay.order.paymentStatus === PAYMENT_PAID || lay.order.paymentStatus === PAYMENT_LAYAWAY_ACTIVE) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.layaway.update({
      where: { id: lay.id, status: LayawayStatus.active },
      data: { status: LayawayStatus.refunded, remainingBalanceUsd: 0 },
    });
    await tx.order.updateMany({
      where: { id: lay.orderId, paymentStatus: { in: [PAYMENT_PENDING, "failed", "cancelled"] } },
      data: { paymentStatus: "cancelled", status: "cancelled" },
    });
    if (lay.listing.status === "layaway_reserved") {
      await tx.listing.update({
        where: { id: lay.listingId },
        data: { status: "active" },
      });
    }
    // Mirrors `defaultLayawayPlan` — an abandoned deposit checkout must release the inventory
    // hold taken in `createLayawayDepositCheckout`, otherwise the listing stays un-buyable by
    // anyone else even after it flips back to `active`.
    await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
      listingId: lay.listingId,
      userId: lay.buyerId,
    });
    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "deposit_checkout_abandoned",
      metadata: { orderId: lay.orderId, listingId: lay.listingId },
    });
  });

  emitLayawayEcosystem(
    "layaway_canceled",
    {
      id: lay.id,
      sellerId: lay.sellerId,
      buyerId: lay.buyerId,
      listingId: lay.listingId,
      orderId: lay.orderId,
    },
    { status: "canceled", listingStatus: "active", abandonedDeposit: true },
  );

  return true;
}

function dueDateForPlan(plan: LayawayPlanType, startedAt: Date): Date {
  const days = LAYAWAY_PLAN_DAYS[plan as LayawayPlanKey];
  return new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Start layaway: reserve listing, create order + layaway row, open Stripe Checkout for 25% deposit. */
export async function createLayawayDepositCheckout(args: {
  buyerId: string;
  listingId: string;
  planType: LayawayPlanType;
  termsAcknowledged: boolean;
  shipping: LayawayShippingInput;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string; layawayId: string }> {
  if (!args.termsAcknowledged) throw new Error("TERMS_REQUIRED");
  if (!isValidLayawayPlan(args.planType)) throw new Error("INVALID_PLAN");
  if (await buyerHasActiveLayaway(args.buyerId)) throw new Error("BUYER_ACTIVE_LAYAWAY");

  const commercePreflight = await loadListingCommerceContext(prisma, args.listingId);
  if (!commercePreflight) throw new Error("LAYAWAY_NOT_AVAILABLE");
  try {
    assertLayawayStartAllowed(commercePreflight, args.buyerId);
  } catch (e) {
    if (e instanceof CommerceGuardError) {
      if (e.code === "ALREADY_SOLD") throw new Error("ALREADY_SOLD");
      if (e.code === "ITEM_RESERVED_ON_LAYAWAY") throw new Error("LISTING_LAYAWAY_LOCKED");
      if (e.code === "CHECKOUT_IN_PROGRESS") throw new Error("CHECKOUT_IN_PROGRESS");
      throw new Error("LAYAWAY_NOT_AVAILABLE");
    }
    throw e;
  }

  const base = siteUrl();
  const successUrl = `${base}${args.successPath ?? "/account/layaways"}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}${args.cancelPath ?? `/marketplace/${encodeURIComponent(args.listingId)}`}`;

  const resolvedMarketplaceShipping = await resolveMarketplaceCheckoutShipping({
    listingId: args.listingId,
    shipTo: {
      shipRecipientName: args.shipping.shipRecipientName,
      shipAddress: args.shipping.shipAddress,
      shipCity: args.shipping.shipCity,
      shipState: args.shipping.shipState,
      shipZip: args.shipping.shipZip,
      shipCountry: args.shipping.shipCountry,
    },
    selectedShippingRateId: args.shipping.selectedShippingRateId,
  });
  const shippingPriceUsd = resolvedMarketplaceShipping.shippingPriceUsd;

  const { order, layaway, listing, depositUsd } = await prisma.$transaction(async (tx) => {
    const listingRow = await tx.listing.findUnique({
      where: { id: args.listingId },
      select: {
        id: true,
        title: true,
        sellerId: true,
        status: true,
        buyingFormat: true,
        priceUsd: true,
        shippingPriceUsd: true,
        allowLayaway: true,
        moderationRemovedAt: true,
        shipFromAddressId: true,
        isCompanyListing: true,
        seller: { select: { stripeAccountId: true, stripeOnboardingComplete: true } },
      },
    });
    if (!listingRow || !listingSupportsLayawayCheckout(listingRow)) throw new Error("LAYAWAY_NOT_AVAILABLE");
    if (listingRow.sellerId === args.buyerId) throw new Error("OWN_LISTING");
    if (!listingRow.seller.stripeAccountId || !listingRow.seller.stripeOnboardingComplete) {
      throw new Error("SELLER_NOT_READY");
    }

    const activeLayaway = await tx.layaway.findFirst({
      where: { listingId: listingRow.id, status: LayawayStatus.active },
      select: { id: true, buyerId: true },
    });
    if (activeLayaway) throw new Error("LISTING_LAYAWAY_LOCKED");

    const existingOrder = await tx.order.findUnique({ where: { listingId: listingRow.id } });
    if (existingOrder?.paymentStatus === PAYMENT_PAID) throw new Error("ALREADY_SOLD");
    if (existingOrder && existingOrder.paymentStatus !== PAYMENT_PENDING) {
      throw new Error("LISTING_UNAVAILABLE");
    }
    if (existingOrder?.paymentStatus === PAYMENT_PENDING && existingOrder.buyerId !== args.buyerId) {
      throw new Error("CHECKOUT_IN_PROGRESS");
    }
    if (existingOrder) {
      await tx.order.delete({ where: { id: existingOrder.id } });
    }

    const depositUsd = layawayDepositUsd(listingRow.priceUsd);
    const remaining = layawayRemainingBalanceUsd({
      itemPriceUsd: listingRow.priceUsd,
      shippingPriceUsd,
    });
    const totalUsd = roundUsd(listingRow.priceUsd + shippingPriceUsd);

    await reserveListingInventoryHoldTx(tx, {
      listingId: listingRow.id,
      userId: args.buyerId,
      source: "buy_now_checkout",
    });

    const orderRow = await tx.order.create({
      data: {
        listingId: listingRow.id,
        buyerId: args.buyerId,
        sellerId: listingRow.sellerId,
        itemPriceUsd: listingRow.priceUsd,
        shippingPriceUsd,
        taxUsd: 0,
        totalUsd,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
        fulfillmentStatus: "pending",
        paymentMethod: OrderPaymentMethod.layaway,
        paymentLabel: "layaway_deposit",
        carrier: resolvedMarketplaceShipping.carrier,
        service: resolvedMarketplaceShipping.service,
        shipRecipientName: args.shipping.shipRecipientName,
        shipAddress: args.shipping.shipAddress,
        shipCity: args.shipping.shipCity,
        shipState: args.shipping.shipState,
        shipZip: args.shipping.shipZip,
        shipCountry: args.shipping.shipCountry,
        buyerAddressId: args.shipping.buyerAddressId ?? null,
        sellerShipFromAddressId: listingRow.shipFromAddressId ?? null,
        payoutStatus: "pending",
      },
    });

    const startedAt = new Date();
    const layawayRow = await tx.layaway.create({
      data: {
        listingId: listingRow.id,
        buyerId: args.buyerId,
        sellerId: listingRow.sellerId,
        orderId: orderRow.id,
        planType: args.planType,
        status: LayawayStatus.active,
        originalPriceUsd: listingRow.priceUsd,
        shippingPriceUsd,
        depositAmountUsd: depositUsd,
        amountPaidUsd: 0,
        remainingBalanceUsd: remaining,
        startedAt,
        dueAt: dueDateForPlan(args.planType, startedAt),
        termsAcknowledgedAt: new Date(),
      },
    });

    await tx.layawayPayment.create({
      data: {
        layawayId: layawayRow.id,
        amountUsd: depositUsd,
        kind: LayawayPaymentKind.deposit,
        status: "pending",
      },
    });

    await tx.listing.update({
      where: { id: listingRow.id },
      data: { status: "layaway_reserved" },
    });

    return { order: orderRow, layaway: layawayRow, listing: listingRow, depositUsd };
  });

  emitLayawayEcosystem(
    "layaway_started",
    {
      id: layaway.id,
      sellerId: listing.sellerId,
      buyerId: args.buyerId,
      listingId: listing.id,
      orderId: order.id,
    },
    {
      status: "active",
      listingStatus: "layaway_reserved",
      orderStatus: "pending",
      paymentStatus: PAYMENT_PENDING,
      pendingDeposit: true,
    },
  );

  const stripe = getStripe();
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: depositUsd,
    isCompanyListing: listing.isCompanyListing,
    liveRoomId: null,
    sellerId: listing.sellerId,
  });

  // Sales tax for the *entire* layaway sale (full item + shipping, not just the deposit) is
  // calculated once here and collected in full with the deposit — see the option comparison in
  // `completeLayawayPlan`'s doc comment and the reconciliation report assumptions. Installments
  // and the balance payoff never add further tax. Tax is intentionally never folded into
  // `Layaway.depositAmountUsd` (which stays principal-only for forfeiture/refund math) — it is
  // its own Stripe Checkout line item and its own Order.taxAmountCents/taxUsd field.
  const sellerShipFrom = await loadSellerShipFromForTax(listing.sellerId);
  const taxEstimate = await estimateSalesTaxCents({
    itemPriceUsd: listing.priceUsd,
    shippingPriceUsd,
    shipTo: args.shipping,
    sellerShipFrom,
  }).catch((e) => {
    console.warn("[layaway] sales tax estimate failed; proceeding without tax", e);
    return { taxAmountCents: 0, taxCalculationId: null, collectTax: false };
  });
  const taxAmountCents = Math.max(0, taxEstimate.taxAmountCents);
  const depositCents = Math.round(depositUsd * 100);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: depositCents,
        product_data: stripeLineItemProductData(
          `Layaway deposit — ${listing.title.slice(0, 80)}`,
          STRIPE_TAX_CODE_TANGIBLE,
        ),
      },
    },
  ];
  if (taxAmountCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: taxAmountCents,
        product_data: { name: "Sales tax" },
      },
    });
  }

  const piMetadata = {
    kind: "layaway_deposit",
    orderId: order.id,
    layawayId: layaway.id,
    listingId: listing.id,
  };
  // When tax is added as a separate line item, the implicit "charge − application_fee" transfer
  // would otherwise hand the tax dollars to the seller too. Set an explicit transfer amount so the
  // seller only ever receives (deposit − platform fee); the platform keeps the fee + the tax.
  const paymentIntentData = connectCheckoutPaymentIntentData({
    destinationAccountId: listing.seller.stripeAccountId!,
    applicationFeeCents: feeCents,
    sellerTransferCents: taxAmountCents > 0 ? Math.max(0, depositCents - feeCents) : null,
    processingFeeCents: feeCents > 0 ? estimateStripeProcessingFeeCents(depositCents + taxAmountCents) : 0,
    metadata: piMetadata,
  });

  // If Stripe is unreachable/erroring after the DB transaction above has already reserved the
  // listing (`layaway_reserved`), created the order + layaway rows, and taken an inventory hold,
  // that state must not be left stranded — mirrors the rollback in `createBuyNowCheckoutSession`.
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...stripeCheckoutSessionPaymentOptions("marketplace"),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        kind: "layaway_deposit",
        orderId: order.id,
        layawayId: layaway.id,
        listingId: listing.id,
        buyerId: args.buyerId,
        ...(taxAmountCents > 0 ? { salesTaxCents: String(taxAmountCents) } : {}),
        ...(taxAmountCents > 0 && taxEstimate.taxCalculationId
          ? { stripeTaxCalculationId: taxEstimate.taxCalculationId }
          : {}),
      },
      line_items: lineItems,
      payment_intent_data: paymentIntentData,
    });

    if (!session.url) throw new Error("CHECKOUT_SESSION_FAILED");

    // Chaos engineering deep-dive (2026-07): once Stripe has handed back a payable session, the
    // buyer can complete payment on `session.url` regardless of our own bookkeeping — never cancel
    // the layaway/order past this point (that would orphan an already-payable session; see the
    // identical fix in `createBuyNowCheckoutSession`). Best-effort persist and let the Stripe<->DB
    // reconciliation cron heal it from Stripe's side if this write fails.
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { stripeCheckoutSessionId: session.id },
      });
    } catch (e) {
      console.error(
        "[layaway] post-session bookkeeping failed (session was created; layaway NOT rolled back)",
        { layawayId: layaway.id, orderId: order.id, sessionId: session.id, error: e },
      );
    }

    return { url: session.url, layawayId: layaway.id };
  } catch (e) {
    await cancelAbandonedLayawayCheckout({ layawayId: layaway.id }).catch((rollbackErr) => {
      console.error("[layaway] rollback after Stripe session failure also failed", layaway.id, rollbackErr);
    });
    throw e;
  }
}

/** After Stripe confirms layaway deposit — reserve listing, hold funds, no shipment/payout. */
export async function finalizeLayawayDepositPaid(args: {
  layawayId: string;
  orderId: string;
  paymentIntentId: string | null;
  checkoutSessionId: string;
}): Promise<void> {
  // Cheap idempotency pre-check so a redelivered webhook skips the Stripe API round-trip below
  // entirely — the transaction re-checks this same condition against fresh data before writing.
  const precheck = await prisma.layaway.findUnique({
    where: { id: args.layawayId },
    select: { amountPaidUsd: true, depositAmountUsd: true },
  });
  if (!precheck || precheck.amountPaidUsd >= precheck.depositAmountUsd) return;

  // Read back the *actual* Checkout Session tax total as the source of truth for what was charged
  // (mirrors `finalizeStripeMarketplaceOrderPaid`) rather than trusting our own pre-checkout
  // estimate, which could differ if the session was retried or Stripe's calculation changed.
  const taxInfo = await fetchCheckoutSessionTax(args.checkoutSessionId).catch((e) => {
    console.error("[layaway] fetchCheckoutSessionTax failed", args.checkoutSessionId, e);
    return null;
  });

  await prisma.$transaction(async (tx) => {
    const lay = await tx.layaway.findUnique({
      where: { id: args.layawayId },
      include: { listing: { select: { id: true, title: true, status: true } }, order: true },
    });
    if (!lay || lay.orderId !== args.orderId) return;
    if (lay.amountPaidUsd >= lay.depositAmountUsd) return;

    await tx.layawayPayment.updateMany({
      where: { layawayId: lay.id, kind: LayawayPaymentKind.deposit, status: "pending" },
      data: {
        status: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: args.paymentIntentId ?? undefined,
        stripeCheckoutSessionId: args.checkoutSessionId,
      },
    });

    const amountPaid = lay.depositAmountUsd;
    const remaining = roundUsd(lay.remainingBalanceUsd);

    await tx.layaway.update({
      where: { id: lay.id },
      data: { amountPaidUsd: amountPaid, remainingBalanceUsd: remaining },
    });

    // Tax was collected in full with this deposit (see `createLayawayDepositCheckout`) — persist
    // it onto the Order now, once, the same way a normal taxable sale would. `totalUsd` becomes
    // the full item + shipping + tax contracted amount; `depositAmountUsd`/`amountPaidUsd` above
    // stay principal-only so forfeiture/refund-above-deposit math is unaffected by tax.
    const taxAmountCents = Math.max(0, taxInfo?.taxAmountCents ?? 0);
    const taxFields = buildOrderTaxPersistFields({
      itemPriceUsd: lay.originalPriceUsd,
      shippingPriceUsd: lay.shippingPriceUsd,
      taxAmountCents,
      stripeTaxCalculationId: taxInfo?.stripeTaxCalculationId ?? null,
      taxJurisdictionState: lay.order.shipState,
    });

    await tx.order.update({
      where: { id: lay.orderId },
      data: {
        paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        stripePaymentIntentId: args.paymentIntentId ?? undefined,
        stripeCheckoutSessionId: args.checkoutSessionId,
        ...orderTaxUpdateData(taxFields),
      },
    });

    await tx.listing.update({
      where: { id: lay.listingId },
      data: { status: "layaway_reserved", allowOffers: false, acceptTradeOffers: false },
    });

    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "deposit_received",
      actorUserId: lay.buyerId,
      metadata: {
        amountUsd: amountPaid,
        paymentIntentId: args.paymentIntentId,
        taxAmountUsd: taxFields.taxUsd,
      },
    });
  });

  void recordStripeTaxTransaction({
    taxCalculationId: taxInfo?.stripeTaxCalculationId ?? null,
    reference: args.orderId,
  });

  const lay = await prisma.layaway.findUnique({
    where: { id: args.layawayId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      listingId: true,
      orderId: true,
      listing: { select: { title: true } },
      depositAmountUsd: true,
      dueAt: true,
    },
  });
  if (!lay) return;

  emitLayawayEcosystem("layaway_started", lay, {
    status: "active",
    listingStatus: "layaway_reserved",
    orderStatus: "pending",
    paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
  });

  const title = lay.listing.title.length > 80 ? `${lay.listing.title.slice(0, 77)}…` : lay.listing.title;
  await createNotification(prisma, {
    userId: lay.buyerId,
    type: "layaway_started",
    title: "Layaway started",
    body: `Your $${lay.depositAmountUsd.toFixed(2)} deposit for “${title}” is confirmed. Pay the remaining balance by ${lay.dueAt.toLocaleDateString()}.`,
    href: `/account/layaways/${encodeURIComponent(lay.id)}`,
  });
  await createNotification(prisma, {
    userId: lay.sellerId,
    type: "layaway_started_seller",
    title: "Item on layaway",
    body: `“${title}” is reserved on layaway. Shipping unlocks when the buyer pays in full.`,
    href: `/account/sales/layaways`,
  });
}

/** Create Stripe Checkout for a partial or full layaway balance payment. */
export async function createLayawayBalanceCheckout(args: {
  layawayId: string;
  buyerId: string;
  amountUsd?: number;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ url: string }> {
  const lay = await prisma.layaway.findFirst({
    where: { id: args.layawayId, buyerId: args.buyerId, status: LayawayStatus.active },
    include: {
      listing: { select: { title: true, isCompanyListing: true, seller: { select: { stripeAccountId: true } } } },
      order: { select: { id: true, paymentStatus: true } },
    },
  });
  if (!lay) throw new Error("LAYAWAY_NOT_FOUND");
  if (lay.order.paymentStatus !== PAYMENT_LAYAWAY_ACTIVE) {
    if (lay.amountPaidUsd + 0.001 < lay.depositAmountUsd) throw new Error("LAYAWAY_DEPOSIT_PENDING");
    throw new Error("LAYAWAY_NOT_ACTIVE");
  }

  const payUsd = roundUsd(
    args.amountUsd != null && Number.isFinite(args.amountUsd) && args.amountUsd > 0
      ? Math.min(args.amountUsd, lay.remainingBalanceUsd)
      : lay.remainingBalanceUsd,
  );
  if (payUsd <= 0) throw new Error("NOTHING_DUE");

  const base = siteUrl();
  const successUrl = `${base}${args.successPath ?? `/account/layaways/${encodeURIComponent(lay.id)}`}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}${args.cancelPath ?? `/account/layaways/${encodeURIComponent(lay.id)}`}`;

  const paymentRow = await prisma.layawayPayment.create({
    data: {
      layawayId: lay.id,
      amountUsd: payUsd,
      kind: payUsd >= lay.remainingBalanceUsd - 0.01 ? LayawayPaymentKind.balance_payoff : LayawayPaymentKind.installment,
      status: "pending",
    },
  });

  const stripe = getStripe();
  // Platform fee applies to item/sale price only (see platform-fee-policy.ts) — shipping is
  // excluded everywhere else. Deposit already fees on 100% of the item's share (25% of item
  // price). The remaining balance bundles the other 75% of item price with 100% of shipping, so
  // apportion this payment: item balance is paid down first, shipping last, and fee only applies
  // to the item portion of *this* payment.
  const itemRemainingUsd = roundUsd(Math.max(0, lay.remainingBalanceUsd - lay.shippingPriceUsd));
  const itemPortionUsd = roundUsd(Math.min(payUsd, itemRemainingUsd));
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: itemPortionUsd,
    isCompanyListing: lay.listing.isCompanyListing,
    liveRoomId: null,
    sellerId: lay.sellerId,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...stripeCheckoutSessionPaymentOptions("marketplace"),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      kind: "layaway_payment",
      orderId: lay.orderId,
      layawayId: lay.id,
      layawayPaymentId: paymentRow.id,
      buyerId: args.buyerId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(payUsd * 100),
          product_data: stripeLineItemProductData(
            `Layaway payment — ${lay.listing.title.slice(0, 80)}`,
            STRIPE_TAX_CODE_TANGIBLE,
          ),
        },
      },
    ],
    payment_intent_data: {
      metadata: {
        kind: "layaway_payment",
        orderId: lay.orderId,
        layawayId: lay.id,
        layawayPaymentId: paymentRow.id,
      },
      // Seller absorbs Stripe processing (2.9% + $0.30) on each installment charge.
      application_fee_amount:
        feeCents + (feeCents > 0 ? estimateStripeProcessingFeeCents(Math.round(payUsd * 100)) : 0),
      transfer_data: { destination: lay.listing.seller.stripeAccountId! },
    },
  });

  await prisma.layawayPayment.update({
    where: { id: paymentRow.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  if (!session.url) throw new Error("CHECKOUT_SESSION_FAILED");
  return { url: session.url };
}

export async function finalizeLayawayInstallmentPaid(args: {
  layawayId: string;
  layawayPaymentId: string;
  orderId: string;
  paymentIntentId: string | null;
  checkoutSessionId: string;
}): Promise<void> {
  const completed = await prisma.$transaction(async (tx) => {
    const pay = await tx.layawayPayment.findFirst({
      where: { id: args.layawayPaymentId, layawayId: args.layawayId, status: "pending" },
    });
    if (!pay) return false;

    const lay = await tx.layaway.findUnique({ where: { id: args.layawayId } });
    if (!lay || lay.status !== LayawayStatus.active) return false;

    await tx.layawayPayment.update({
      where: { id: pay.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: args.paymentIntentId ?? undefined,
        stripeCheckoutSessionId: args.checkoutSessionId,
      },
    });

    const newPaid = roundUsd(lay.amountPaidUsd + pay.amountUsd);
    const newRemaining = roundUsd(Math.max(0, lay.remainingBalanceUsd - pay.amountUsd));

    await tx.layaway.update({
      where: { id: lay.id },
      data: { amountPaidUsd: newPaid, remainingBalanceUsd: newRemaining },
    });

    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "payment_received",
      actorUserId: lay.buyerId,
      metadata: { amountUsd: pay.amountUsd, paymentIntentId: args.paymentIntentId },
    });

    return newRemaining <= 0.01;
  });

  if (completed) {
    await completeLayawayPlan(args.layawayId);
    return;
  }

  const lay = await prisma.layaway.findUnique({
    where: { id: args.layawayId },
    include: {
      listing: { select: { title: true } },
      payments: {
        where: { id: args.layawayPaymentId, status: "paid" },
        take: 1,
        select: { amountUsd: true },
      },
    },
  });
  if (!lay?.payments[0]) return;

  const title = lay.listing.title.length > 80 ? `${lay.listing.title.slice(0, 77)}…` : lay.listing.title;
  const paidUsd = lay.payments[0].amountUsd;
  emitLayawayEcosystem(
    "layaway_payment_made",
    { id: lay.id, sellerId: lay.sellerId, buyerId: lay.buyerId, listingId: lay.listingId, orderId: lay.orderId },
    {
      amountPaidUsd: lay.amountPaidUsd,
      remainingBalanceUsd: lay.remainingBalanceUsd,
      paymentAmountUsd: paidUsd,
    },
  );
  await createNotification(prisma, {
    userId: lay.buyerId,
    type: "layaway_payment",
    title: "Layaway payment received",
    body: `Your $${paidUsd.toFixed(2)} payment for “${title}” was applied. $${lay.remainingBalanceUsd.toFixed(2)} remains.`,
    href: `/account/layaways/${encodeURIComponent(lay.id)}`,
  });
  await createNotification(prisma, {
    userId: lay.sellerId,
    type: "layaway_payment_seller",
    title: "Layaway payment received",
    body: `Buyer paid $${paidUsd.toFixed(2)} toward “${title}”. $${lay.remainingBalanceUsd.toFixed(2)} remaining — do not ship yet.`,
    href: `/account/sales/layaways`,
  });
}

/** Convert layaway to a normal paid marketplace order and unlock shipping/payout workflow. */
export async function completeLayawayPlan(layawayId: string): Promise<void> {
  const lay = await prisma.layaway.findUnique({
    where: { id: layawayId },
    include: { order: true, listing: { select: { title: true } } },
  });
  if (!lay) return;

  const shippingChargedCents = Math.round(Math.max(0, lay.shippingPriceUsd) * 100);

  // A layaway is paid across several separate PaymentIntents (deposit, installments, balance
  // payoff) — there is no single PI that represents "the charge" for the order the way a regular
  // Stripe/escrow order has. We copy the *final* payment's PI onto the Order purely so admin
  // tooling and support have a Stripe reference to click into; it intentionally does NOT make the
  // order refundable via the single-PI refund flow (`order-refund-request.ts` requires
  // `paymentMethod !== layaway`... see that file's guard) since a full refund must reverse every
  // installment, not just the last one. Dispute/chargeback webhook matching does not rely on this
  // field for layaway orders — it also checks `LayawayPayment.stripePaymentIntentId` directly so a
  // chargeback on ANY installment (not just the last) is still caught. See
  // `resolveOrderIdForDisputedPaymentIntent` in `payments.ts`.
  const lastPayment = await prisma.layawayPayment.findFirst({
    where: { layawayId: lay.id, status: "paid", stripePaymentIntentId: { not: null } },
    orderBy: { paidAt: "desc" },
    select: { stripePaymentIntentId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.layaway.update({
      where: { id: lay.id, status: LayawayStatus.active },
      data: { status: LayawayStatus.completed, completedAt: new Date(), remainingBalanceUsd: 0 },
    });
    await tx.listing.update({
      where: { id: lay.listingId },
      data: { status: "sold" },
    });
    await tx.order.update({
      where: { id: lay.orderId },
      data: {
        paymentStatus: PAYMENT_PAID,
        status: "paid",
        shippingChargedCents,
        // Tax was already collected in full with the deposit (`finalizeLayawayDepositPaid`) and
        // is not re-collected here — fold `order.taxUsd` back in so a completed layaway's
        // `totalUsd` reconciles exactly like a normal taxable sale (item + shipping + tax).
        totalUsd: roundUsd(lay.originalPriceUsd + lay.shippingPriceUsd + (lay.order.taxUsd ?? 0)),
        stripePaymentIntentId: lastPayment?.stripePaymentIntentId ?? lay.order.stripePaymentIntentId ?? undefined,
      },
    });
    await consumeListingInventoryHoldTx(tx, {
      listingId: lay.listingId,
      userId: lay.buyerId,
      orderId: lay.orderId,
    });
    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "completion",
      actorUserId: lay.buyerId,
      metadata: { amountPaidUsd: lay.amountPaidUsd },
    });
  });

  await initializeOrderPayoutOnPayment(lay.orderId);

  // Referral program: a layaway order only counts as "paid" once fully paid off (not at
  // deposit) — this is the layaway equivalent of `finalizeStripeMarketplaceOrderPaid`'s grant
  // call. Best-effort, never throws.
  void grantReferralCreditsForQualifyingOrder(lay.orderId);

  const layParties = {
    id: lay.id,
    sellerId: lay.sellerId,
    buyerId: lay.buyerId,
    listingId: lay.listingId,
    orderId: lay.orderId,
  };
  emitLayawayEcosystem("layaway_paid_in_full", layParties, {
    status: "completed",
    listingStatus: "sold",
    orderStatus: "paid",
    paymentStatus: PAYMENT_PAID,
  });
  emitOrderLifecycleSync({
    orderId: lay.orderId,
    parties: { sellerId: lay.sellerId, buyerId: lay.buyerId },
    listingId: lay.listingId,
    layawayId: lay.id,
    orderStatus: "paid",
    paymentStatus: PAYMENT_PAID,
    listingStatus: "sold",
  });

  const title = lay.listing.title.length > 80 ? `${lay.listing.title.slice(0, 77)}…` : lay.listing.title;
  await createNotification(prisma, {
    userId: lay.buyerId,
    type: "layaway_completed",
    title: "Layaway paid in full",
    body: `“${title}” is fully paid. We'll notify you when the seller ships.`,
    href: `/orders/${encodeURIComponent(lay.orderId)}`,
  });
  await createNotification(prisma, {
    userId: lay.sellerId,
    type: "layaway_completed_seller",
    title: "Layaway completed — ready to ship",
    body: `“${title}” is paid in full. Create a shipping label from Sales.`,
    href: `/orders/${encodeURIComponent(lay.orderId)}`,
  });
}

/** Default overdue layaway: forfeit deposit, refund excess, re-list item. */
export async function defaultLayawayPlan(layawayId: string): Promise<void> {
  const lay = await prisma.layaway.findFirst({
    where: { id: layawayId, status: LayawayStatus.active },
    include: { listing: { select: { title: true } }, order: true },
  });
  if (!lay) return;

  const refundable = layawayRefundableAboveDepositUsd(lay.amountPaidUsd, lay.depositAmountUsd);
  const depositForfeited = lay.depositAmountUsd;

  const claimed = await prisma.$transaction(async (tx) => {
    // Atomic claim: guards against a concurrent cron run or a final-payment webhook racing
    // this same layaway past the `active` status check above (TOCTOU otherwise).
    const claim = await tx.layaway.updateMany({
      where: { id: lay.id, status: LayawayStatus.active },
      data: { status: LayawayStatus.defaulted, defaultedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await tx.listing.update({
      where: { id: lay.listingId },
      data: { status: "active", allowOffers: true },
    });
    await tx.order.update({
      where: { id: lay.orderId },
      data: { paymentStatus: "cancelled", status: "cancelled" },
    });
    await releaseActiveInventoryHoldsForListingAndBuyerTx(tx, {
      listingId: lay.listingId,
      userId: lay.buyerId,
    });
    await logLayawayAudit(tx, {
      layawayId: lay.id,
      action: "default",
      metadata: { depositForfeitedUsd: depositForfeited, refundableUsd: refundable },
    });
    if (refundable > 0) {
      await logLayawayAudit(tx, {
        layawayId: lay.id,
        action: "refund_issued",
        metadata: { amountUsd: refundable },
      });
    }
    return true;
  });

  if (!claimed) return;

  if (refundable > 0) {
    const stripe = getStripe();
    const paidInstallments = await prisma.layawayPayment.findMany({
      where: {
        layawayId: lay.id,
        status: "paid",
        kind: { in: [LayawayPaymentKind.installment, LayawayPaymentKind.balance_payoff] },
        stripePaymentIntentId: { not: null },
      },
      orderBy: { paidAt: "desc" },
    });
    let remainingRefund = refundable;
    for (const pay of paidInstallments) {
      if (remainingRefund <= 0) break;
      const refundAmt = Math.min(remainingRefund, pay.amountUsd);
      try {
        await stripe.refunds.create({
          payment_intent: pay.stripePaymentIntentId!,
          amount: Math.round(refundAmt * 100),
          // Each installment was a destination charge that already transferred (item - fee) to
          // the seller. Without reverse_transfer the platform's own balance funds the refund
          // while the seller keeps money for a sale that is being unwound — reclaim it first.
          reverse_transfer: true,
          metadata: { layawayId: lay.id, layawayPaymentId: pay.id, kind: "layaway_default_refund" },
        }, { idempotencyKey: `layaway_default_refund_${pay.id}_${Math.round(refundAmt * 100)}c` });
        remainingRefund = roundUsd(remainingRefund - refundAmt);
      } catch (e) {
        console.error("[layaway] installment refund failed", pay.id, e);
      }
    }
  }

  // Sales tax was collected in full with the deposit and is never forfeitable — it belongs to the
  // taxing jurisdiction, not the platform or seller, regardless of what happens to the deposit
  // principal. Refund it separately from (and regardless of) the "amount paid above deposit"
  // refund above, which only ever covers installment/balance-payoff kinds.
  const taxRefundCents = Math.max(0, Math.round((lay.order.taxAmountCents ?? 0) - (lay.order.taxRefundedCents ?? 0)));
  if (taxRefundCents > 0) {
    const depositPayment = await prisma.layawayPayment.findFirst({
      where: {
        layawayId: lay.id,
        kind: LayawayPaymentKind.deposit,
        status: "paid",
        stripePaymentIntentId: { not: null },
      },
    });
    if (depositPayment?.stripePaymentIntentId) {
      try {
        const stripe = getStripe();
        await stripe.refunds.create({
          payment_intent: depositPayment.stripePaymentIntentId,
          amount: taxRefundCents,
          // Tax was added as its own line item and explicitly excluded from the seller's transfer
          // at checkout (see `createLayawayDepositCheckout`'s `sellerTransferCents`) — it has been
          // sitting in the platform's own Stripe balance the whole time, so there is nothing to
          // reverse_transfer. The deposit *principal* on this same charge is intentionally left
          // un-refunded (forfeited); Stripe will therefore continue to report this charge as only
          // partially refunded, which is expected — see the `charge.refunded` webhook handler.
          metadata: { layawayId: lay.id, layawayPaymentId: depositPayment.id, kind: "layaway_default_tax_refund" },
        }, { idempotencyKey: `layaway_default_tax_refund_${depositPayment.id}_${taxRefundCents}c` });
        await prisma.order.update({
          where: { id: lay.orderId },
          data: { taxRefundedCents: { increment: taxRefundCents } },
        });
      } catch (e) {
        console.error("[layaway] tax refund failed", lay.id, e);
      }
    } else {
      console.error("[layaway] tax refund skipped — deposit payment intent not found", lay.id);
    }
  }

  const layParties = {
    id: lay.id,
    sellerId: lay.sellerId,
    buyerId: lay.buyerId,
    listingId: lay.listingId,
    orderId: lay.orderId,
  };
  emitLayawayEcosystem("layaway_defaulted", layParties, {
    status: "defaulted",
    listingStatus: "active",
    orderStatus: "cancelled",
    paymentStatus: "cancelled",
  });

  const title = lay.listing.title.length > 80 ? `${lay.listing.title.slice(0, 77)}…` : lay.listing.title;
  const refundNotes = [
    refundable > 0 ? `$${refundable.toFixed(2)} paid above the deposit was refunded` : null,
    taxRefundCents > 0 ? `$${(taxRefundCents / 100).toFixed(2)} in sales tax was refunded` : null,
  ].filter((n): n is string => n != null);
  await createNotification(prisma, {
    userId: lay.buyerId,
    type: "layaway_defaulted",
    title: "Layaway defaulted",
    body: `Your layaway for “${title}” expired. Your deposit was forfeited${refundNotes.length > 0 ? `; ${refundNotes.join(" and ")}` : ""}.`,
    href: `/account/layaways`,
  });
  await createNotification(prisma, {
    userId: lay.sellerId,
    type: "layaway_defaulted_seller",
    title: "Layaway defaulted",
    body: `The layaway on “${title}” expired. The listing is active again; deposit forfeiture was applied per policy.`,
    href: `/account/sales/layaways`,
  });
}

/** Process overdue layaways and send plan reminders. Safe to call from cron or reads. */
export async function processLayawayMaintenance(): Promise<{
  overdueCandidates: number;
  defaulted: number;
  defaultFailures: number;
}> {
  const now = new Date();

  const overdue = await prisma.layaway.findMany({
    where: { status: LayawayStatus.active, dueAt: { lt: now } },
    select: { id: true },
    take: 50,
  });
  let defaulted = 0;
  let defaultFailures = 0;
  for (const row of overdue) {
    try {
      await defaultLayawayPlan(row.id);
      defaulted += 1;
    } catch (e) {
      defaultFailures += 1;
      console.error("[layaway] default failed", row.id, e);
    }
  }

  const { LAYAWAY_REMINDER_DAYS, layawayFinalWarningDay } = await import("@/lib/layaway/constants");
  const active = await prisma.layaway.findMany({
    where: { status: LayawayStatus.active, dueAt: { gte: now } },
    select: {
      id: true,
      buyerId: true,
      planType: true,
      startedAt: true,
      lastReminderDay: true,
      listing: { select: { title: true } },
      remainingBalanceUsd: true,
      dueAt: true,
    },
    take: 200,
  });

  for (const lay of active) {
    const plan = lay.planType as LayawayPlanKey;
    const elapsedDays = Math.floor((now.getTime() - lay.startedAt.getTime()) / (24 * 60 * 60 * 1000));
    const schedule = [...LAYAWAY_REMINDER_DAYS[plan], layawayFinalWarningDay(plan)];
    // Catch-up, not exact-day match: a cron that skips a day (deploy gap, platform hiccup, missed
    // schedule trigger) must not permanently skip that reminder. Pick the *latest* scheduled day
    // that has already passed and hasn't been sent yet, instead of requiring `d === elapsedDays`.
    const due = schedule
      .filter((d) => d <= elapsedDays && (lay.lastReminderDay ?? 0) < d)
      .sort((a, b) => b - a)[0];
    if (due === undefined) continue;

    const title = lay.listing.title.length > 60 ? `${lay.listing.title.slice(0, 57)}…` : lay.listing.title;
    const isFinal = due === layawayFinalWarningDay(plan);
    await createNotification(prisma, {
      userId: lay.buyerId,
      type: isFinal ? "layaway_final_warning" : "layaway_reminder",
      title: isFinal ? "Layaway expires today" : "Layaway payment reminder",
      body: isFinal
        ? `Final warning: your layaway for “${title}” expires ${lay.dueAt.toLocaleDateString()}. $${lay.remainingBalanceUsd.toFixed(2)} remains.`
        : `Reminder: $${lay.remainingBalanceUsd.toFixed(2)} remains on your layaway for “${title}”. Due ${lay.dueAt.toLocaleDateString()}.`,
      href: `/account/layaways/${encodeURIComponent(lay.id)}`,
    });

    await prisma.layaway.update({
      where: { id: lay.id },
      data: { lastReminderDay: due },
    });
  }

  return { overdueCandidates: overdue.length, defaulted, defaultFailures };
}

export function layawayDefaultSellerNetUsd(depositUsd: number, feePercent = marketplacePlatformFeePercent()): number {
  const fee = applicationFeeCentsFromSubtotalUsd(depositUsd, feePercent) / 100;
  return roundUsd(depositUsd - fee);
}
