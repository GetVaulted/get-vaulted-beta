import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  ensureStripeCustomerIdForUser,
  getBuyerDefaultCardPaymentMethodId,
  setBuyerDefaultPaymentMethod,
} from "@/lib/stripe-customer";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { syncBuyerDefaultShippingToPendingOrder } from "@/lib/live-buy-now-purchase";

export function setupIntentIdFromClientSecret(clientSecret: string): string | null {
  const trimmed = clientSecret.trim();
  const marker = "_secret_";
  const idx = trimmed.indexOf(marker);
  if (idx <= 0) return null;
  const id = trimmed.slice(0, idx);
  return id.startsWith("seti_") ? id : null;
}

/** Temporary debug logging for payment recovery card selection. */
export function logRecoveryPaymentMethod(pm: Stripe.PaymentMethod, context: string): void {
  console.info(`[payment recovery] ${context}`, {
    "paymentMethod.id": pm.id,
    "paymentMethod.card.exp_month": pm.card?.exp_month ?? null,
    "paymentMethod.card.exp_year": pm.card?.exp_year ?? null,
  });
}

function isCardExpired(expMonth: number, expYear: number, now = new Date()): boolean {
  if (!expMonth || !expYear) return false;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return expYear < year || (expYear === year && expMonth < month);
}

export async function promoteBuyerPaymentMethodAsDefault(args: {
  userId: string;
  paymentMethodId: string;
  detachExpiredCards?: boolean;
}): Promise<Stripe.PaymentMethod> {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!isStripePaymentMethodId(args.paymentMethodId)) throw new Error("INVALID_PAYMENT_METHOD");

  const customerId = await ensureStripeCustomerIdForUser(args.userId);
  const stripe = getStripe();
  let pm = await stripe.paymentMethods.retrieve(args.paymentMethodId);

  const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (!pmCustomer) {
    pm = await stripe.paymentMethods.attach(args.paymentMethodId, { customer: customerId });
  } else if (pmCustomer !== customerId) {
    throw new Error("PM_NOT_OWNED");
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  logRecoveryPaymentMethod(pm, "promoted customer default payment method");

  if (args.detachExpiredCards !== false) {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
    for (const row of list.data) {
      if (row.id === pm.id) continue;
      const expMonth = row.card?.exp_month ?? 0;
      const expYear = row.card?.exp_year ?? 0;
      if (!isCardExpired(expMonth, expYear)) continue;
      try {
        await stripe.paymentMethods.detach(row.id);
        console.info("[payment recovery] detached expired payment method", {
          "paymentMethod.id": row.id,
          "paymentMethod.card.exp_month": expMonth,
          "paymentMethod.card.exp_year": expYear,
        });
      } catch (e) {
        console.warn("[payment recovery] could not detach expired payment method", row.id, e);
      }
    }
  }

  return pm;
}

export async function finalizeBuyerPaymentMethod(args: {
  userId: string;
  paymentMethodId: string;
}): Promise<{ paymentMethodId: string; expMonth: number; expYear: number; brand: string; last4: string }> {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!isStripePaymentMethodId(args.paymentMethodId)) throw new Error("INVALID_PAYMENT_METHOD");

  const pm = await promoteBuyerPaymentMethodAsDefault({
    userId: args.userId,
    paymentMethodId: args.paymentMethodId.trim(),
    detachExpiredCards: true,
  });

  // Keep User.buyerDefaultWalletPaymentMethodId in sync — recovery retries prefer this over Stripe's
  // customer default, so a newly saved card must become the app default or Retry keeps the old PM.
  await setBuyerDefaultPaymentMethod(args.userId, pm.id);

  const brandRaw =
    pm.type === "cashapp"
      ? "Cash App"
      : pm.type === "link"
        ? "Link"
        : pm.type === "amazon_pay"
          ? "Amazon Pay"
          : (pm.card?.brand ?? pm.type ?? "card");
  const brand =
    pm.type === "cashapp" || pm.type === "link" || pm.type === "amazon_pay"
      ? brandRaw
      : brandRaw.slice(0, 1).toUpperCase() + brandRaw.slice(1);

  const last4 =
    pm.type === "cashapp"
      ? pm.cashapp?.cashtag?.replace("$", "").slice(-4) || "····"
      : pm.type === "link"
        ? pm.link?.email?.slice(-4) || "····"
        : (pm.card?.last4 ?? "0000");

  return {
    paymentMethodId: pm.id,
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    brand,
    last4,
  };
}

export async function finalizeBuyerPaymentMethodSetup(args: {
  userId: string;
  paymentMethodId?: string | null;
  setupIntentId?: string | null;
  clientSecret?: string | null;
}): Promise<{ paymentMethodId: string; expMonth: number; expYear: number; brand: string; last4: string }> {
  const paymentMethodId = args.paymentMethodId?.trim() ?? "";
  if (isStripePaymentMethodId(paymentMethodId)) {
    return finalizeBuyerPaymentMethod({ userId: args.userId, paymentMethodId });
  }
  return finalizeBuyerSetupIntent({
    userId: args.userId,
    setupIntentId: args.setupIntentId,
    clientSecret: args.clientSecret,
  });
}

export async function finalizeBuyerSetupIntent(args: {
  userId: string;
  setupIntentId?: string | null;
  clientSecret?: string | null;
}): Promise<{ paymentMethodId: string; expMonth: number; expYear: number; brand: string; last4: string }> {
  if (!isStripeConfigured()) throw new Error("STRIPE_NOT_CONFIGURED");

  const setupIntentId =
    args.setupIntentId?.trim() ||
    (args.clientSecret?.trim() ? setupIntentIdFromClientSecret(args.clientSecret) : null);
  if (!setupIntentId) throw new Error("SETUP_INTENT_ID_REQUIRED");

  const customerId = await ensureStripeCustomerIdForUser(args.userId);
  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  const siCustomer = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;
  if (siCustomer !== customerId) throw new Error("SETUP_INTENT_NOT_OWNED");
  if (setupIntent.status !== "succeeded") {
    throw new Error(`SETUP_INTENT_NOT_SUCCEEDED:${setupIntent.status}`);
  }

  const paymentMethodRaw = setupIntent.payment_method;
  const paymentMethodId =
    typeof paymentMethodRaw === "string"
      ? paymentMethodRaw
      : paymentMethodRaw && typeof paymentMethodRaw === "object" && "id" in paymentMethodRaw
        ? String((paymentMethodRaw as { id: string }).id)
        : "";
  if (!isStripePaymentMethodId(paymentMethodId)) throw new Error("SETUP_INTENT_PM_MISSING");

  return finalizeBuyerPaymentMethod({ userId: args.userId, paymentMethodId });
}

/** Latest customer default card for recovery retries — never reuse stale order PM without refresh. */
export async function resolveBuyerRecoveryPaymentMethodId(userId: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;

  const pmId = await getBuyerDefaultCardPaymentMethodId(userId);
  if (!pmId) {
    console.info("[payment recovery] no default payment method on customer", { userId });
    return null;
  }

  const stripe = getStripe();
  const pm = await stripe.paymentMethods.retrieve(pmId);
  console.info("[payment recovery] resolved recovery payment method", {
    paymentMethodId: pm.id,
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
  });
  return pm.id;
}

/** Point unpaid recovery targets at the latest default PM and drop stale PaymentIntents. */
export async function refreshRecoveryPaymentReferences(args: {
  buyerId: string;
  paymentMethodId: string;
  orderId?: string | null;
  variantPurchaseId?: string | null;
  breakSpotId?: string | null;
}): Promise<void> {
  if (!isStripePaymentMethodId(args.paymentMethodId)) return;

  console.info("[payment recovery] clearing stale stripePaymentIntentId", {
    buyerId: args.buyerId,
    paymentMethodId: args.paymentMethodId,
    orderId: args.orderId ?? null,
    variantPurchaseId: args.variantPurchaseId ?? null,
    breakSpotId: args.breakSpotId ?? null,
  });

  if (args.orderId) {
    await syncBuyerDefaultShippingToPendingOrder(args.orderId, args.buyerId).catch((err) => {
      console.warn("[payment recovery] could not sync buyer shipping to order", {
        orderId: args.orderId,
        buyerId: args.buyerId,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    await prisma.order.updateMany({
      where: {
        id: args.orderId,
        buyerId: args.buyerId,
        paymentStatus: { not: "paid" },
      },
      data: {
        paymentLabel: args.paymentMethodId,
        stripePaymentIntentId: null,
      },
    });
  }

  if (args.variantPurchaseId) {
    const purchase = await prisma.liveItemVariantPurchase.findFirst({
      where: { id: args.variantPurchaseId, buyerId: args.buyerId },
      select: { fulfillmentOrderId: true },
    });
    if (purchase?.fulfillmentOrderId) {
      await syncBuyerDefaultShippingToPendingOrder(purchase.fulfillmentOrderId, args.buyerId).catch((err) => {
        console.warn("[payment recovery] could not sync buyer shipping to variant fulfillment order", {
          variantPurchaseId: args.variantPurchaseId,
          orderId: purchase.fulfillmentOrderId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
    await prisma.liveItemVariantPurchase.updateMany({
      where: {
        id: args.variantPurchaseId,
        buyerId: args.buyerId,
        paymentStatus: { not: "paid" },
      },
      data: { stripePaymentIntentId: null },
    });
  }

  if (args.breakSpotId) {
    const spot = await prisma.breakSpot.findFirst({
      where: { id: args.breakSpotId, userId: args.buyerId },
      select: { fulfillmentOrderId: true },
    });
    if (spot?.fulfillmentOrderId) {
      await syncBuyerDefaultShippingToPendingOrder(spot.fulfillmentOrderId, args.buyerId).catch((err) => {
        console.warn("[payment recovery] could not sync buyer shipping to break fulfillment order", {
          breakSpotId: args.breakSpotId,
          orderId: spot.fulfillmentOrderId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
    await prisma.breakSpot.updateMany({
      where: {
        id: args.breakSpotId,
        userId: args.buyerId,
        breakPaymentStatus: { not: "paid" },
      },
      data: { stripePaymentIntentId: null },
    });
  }
}
