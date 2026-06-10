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
import { stripeLineItemProductData, STRIPE_TAX_CODE_TANGIBLE, TAX_PROVIDER_STRIPE } from "@/lib/stripe-tax";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID, PAYMENT_PENDING } from "@/services/payments";
import { initializeOrderPayoutOnPayment } from "@/services/payout/process-delivery-payout";
import { fulfillOrderShippingAfterPayment } from "@/services/shipping";

export type LayawayShippingInput = {
  buyerAddressId?: string | null;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
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
      shippingPriceUsd: listingRow.shippingPriceUsd,
    });
    const totalUsd = roundUsd(listingRow.priceUsd + listingRow.shippingPriceUsd);

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
        shippingPriceUsd: listingRow.shippingPriceUsd,
        taxUsd: 0,
        totalUsd,
        status: "pending",
        paymentStatus: PAYMENT_PENDING,
        fulfillmentStatus: "pending",
        paymentMethod: OrderPaymentMethod.layaway,
        paymentLabel: "layaway_deposit",
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
        shippingPriceUsd: listingRow.shippingPriceUsd,
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
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      kind: "layaway_deposit",
      orderId: order.id,
      layawayId: layaway.id,
      listingId: listing.id,
      buyerId: args.buyerId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(depositUsd * 100),
          product_data: stripeLineItemProductData(
            `Layaway deposit — ${listing.title.slice(0, 80)}`,
            STRIPE_TAX_CODE_TANGIBLE,
          ),
        },
      },
    ],
    payment_intent_data: {
      metadata: {
        kind: "layaway_deposit",
        orderId: order.id,
        layawayId: layaway.id,
        listingId: listing.id,
      },
      application_fee_amount: feeCents,
      transfer_data: { destination: listing.seller.stripeAccountId! },
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  if (!session.url) throw new Error("CHECKOUT_SESSION_FAILED");
  return { url: session.url, layawayId: layaway.id };
}

/** After Stripe confirms layaway deposit — reserve listing, hold funds, no shipment/payout. */
export async function finalizeLayawayDepositPaid(args: {
  layawayId: string;
  orderId: string;
  paymentIntentId: string | null;
  checkoutSessionId: string;
}): Promise<void> {
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

    await tx.order.update({
      where: { id: lay.orderId },
      data: {
        paymentStatus: PAYMENT_LAYAWAY_ACTIVE,
        stripePaymentIntentId: args.paymentIntentId ?? undefined,
        stripeCheckoutSessionId: args.checkoutSessionId,
        taxProvider: TAX_PROVIDER_STRIPE,
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
      metadata: { amountUsd: amountPaid, paymentIntentId: args.paymentIntentId },
    });
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
  const feeCents = await resolveCheckoutApplicationFeeCents({
    saleAmountUsd: payUsd,
    isCompanyListing: lay.listing.isCompanyListing,
    liveRoomId: null,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
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
      application_fee_amount: feeCents,
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
        totalUsd: roundUsd(lay.originalPriceUsd + lay.shippingPriceUsd),
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
  await fulfillOrderShippingAfterPayment(lay.orderId);

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

  await prisma.$transaction(async (tx) => {
    await tx.layaway.update({
      where: { id: lay.id },
      data: { status: LayawayStatus.defaulted, defaultedAt: new Date() },
    });
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
  });

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
          metadata: { layawayId: lay.id, layawayPaymentId: pay.id, kind: "layaway_default_refund" },
        });
        remainingRefund = roundUsd(remainingRefund - refundAmt);
      } catch (e) {
        console.error("[layaway] installment refund failed", pay.id, e);
      }
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
  await createNotification(prisma, {
    userId: lay.buyerId,
    type: "layaway_defaulted",
    title: "Layaway defaulted",
    body: `Your layaway for “${title}” expired. Your deposit was forfeited${refundable > 0 ? `; $${refundable.toFixed(2)} was refunded` : ""}.`,
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
export async function processLayawayMaintenance(): Promise<void> {
  const now = new Date();

  const overdue = await prisma.layaway.findMany({
    where: { status: LayawayStatus.active, dueAt: { lt: now } },
    select: { id: true },
    take: 50,
  });
  for (const row of overdue) {
    try {
      await defaultLayawayPlan(row.id);
    } catch (e) {
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
    const due = schedule.find((d) => d === elapsedDays && (lay.lastReminderDay ?? 0) < d);
    if (!due) continue;

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
}

export function layawayDefaultSellerNetUsd(depositUsd: number, feePercent = marketplacePlatformFeePercent()): number {
  const fee = applicationFeeCentsFromSubtotalUsd(depositUsd, feePercent) / 100;
  return roundUsd(depositUsd - fee);
}
