import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  stripePmTypeToWalletType,
  type BuyerWalletPaymentMethodDTO,
} from "@/lib/payment-processor";
import { isLiveEligibleStripePaymentMethodType } from "@/lib/stripe-payment-method-config";
import {
  buyerHasVenmoOnFile,
  getBuyerVenmoWalletMethod,
  isVenmoWalletPaymentMethodId,
} from "@/lib/paypal-buyer-venmo";
import {
  buyerHasPayPalWalletOnFile,
  getBuyerPayPalWalletMethod,
  isPayPalWalletPaymentMethodId,
} from "@/lib/paypal-buyer-wallet";
import { isPayPalRailWalletPaymentMethodId } from "@/lib/paypal-buyer-rail";
import type Stripe from "stripe";

export type BuyerCardPaymentMethodRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type { BuyerWalletPaymentMethodDTO };

function formatBrand(brand: string | null | undefined): string {
  const b = (brand ?? "card").toLowerCase();
  if (b === "amex") return "American Express";
  if (b === "diners") return "Diners Club";
  return b.slice(0, 1).toUpperCase() + b.slice(1);
}

function isCardExpired(expMonth: number, expYear: number, now = new Date()): boolean {
  if (!expMonth || !expYear) return false;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return expYear < year || (expYear === year && expMonth < month);
}

/**
 * Ensures the user has a Stripe Customer and returns its id.
 * @throws If Stripe is not configured or customer creation fails.
 */
export async function ensureStripeCustomerIdForUser(userId: string): Promise<string> {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.stripeCustomerId?.trim()) return user.stripeCustomerId.trim();

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { app_user_id: user.id },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Lists saved card PaymentMethods for the buyer. Returns [] if no customer or Stripe off. */
export async function listBuyerCardPaymentMethods(userId: string): Promise<BuyerCardPaymentMethodRow[]> {
  if (!isStripeConfigured()) return [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  const customerId = user?.stripeCustomerId?.trim();
  if (!customerId) return [];

  const stripe = getStripe();
  const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
  return list.data.map((pm) => {
    const card = pm.card;
    return {
      id: pm.id,
      brand: formatBrand(card?.brand ?? pm.type),
      last4: card?.last4 ?? "0000",
      expMonth: card?.exp_month ?? 0,
      expYear: card?.exp_year ?? 0,
    };
  });
}

const WALLET_PM_STRIPE_TYPES = ["card", "link", "cashapp", "amazon_pay", "paypal"] as const;

function isUsableLivePaymentMethod(pm: Stripe.PaymentMethod): boolean {
  if (!isLiveEligibleStripePaymentMethodType(pm.type)) return false;
  if (pm.type === "card") {
    const expMonth = pm.card?.exp_month ?? 0;
    const expYear = pm.card?.exp_year ?? 0;
    return !isCardExpired(expMonth, expYear);
  }
  return true;
}

async function resolveDefaultPaymentMethodId(customerId: string): Promise<string | null> {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return null;
  const dpm = customer.invoice_settings?.default_payment_method;
  let defaultId: string | null = null;
  if (typeof dpm === "string" && dpm.startsWith("pm_")) defaultId = dpm;
  if (dpm && typeof dpm === "object" && "id" in dpm) {
    const id = (dpm as { id: string }).id;
    if (typeof id === "string" && id.startsWith("pm_")) defaultId = id;
  }
  if (defaultId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(defaultId);
      if (isUsableLivePaymentMethod(pm)) return defaultId;
    } catch {
      /* fall through to first usable wallet PM */
    }
  }

  for (const pmType of WALLET_PM_STRIPE_TYPES) {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: pmType });
    const valid = list.data.find((pm) => isUsableLivePaymentMethod(pm));
    if (valid) return valid.id;
  }
  return null;
}

/** All saved wallet payment methods (Stripe PMs + vaulted Venmo / PayPal). */
export async function listBuyerWalletPaymentMethods(userId: string): Promise<BuyerWalletPaymentMethodDTO[]> {
  const [stripeRows, venmo, paypal] = await Promise.all([
    listStripeBuyerWalletPaymentMethods(userId),
    getBuyerVenmoWalletMethod(userId),
    getBuyerPayPalWalletMethod(userId),
  ]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { buyerDefaultWalletPaymentMethodId: true },
  });
  const preferred = user?.buyerDefaultWalletPaymentMethodId?.trim() ?? "";

  const rows = [...stripeRows];
  if (venmo) rows.push(venmo);
  if (paypal) rows.push(paypal);

  if (preferred) {
    return rows.map((row) => ({ ...row, isDefault: row.id === preferred }));
  }
  if (rows.some((r) => r.isDefault)) return rows;
  if (paypal) {
    return rows.map((row) => ({ ...row, isDefault: row.id === paypal.id }));
  }
  if (venmo) {
    return rows.map((row) => ({ ...row, isDefault: row.id === venmo.id }));
  }
  return rows;
}

async function listStripeBuyerWalletPaymentMethods(userId: string): Promise<BuyerWalletPaymentMethodDTO[]> {
  if (!isStripeConfigured()) return [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  const customerId = user?.stripeCustomerId?.trim();
  if (!customerId) return [];

  const stripe = getStripe();
  const defaultId = await resolveDefaultPaymentMethodId(customerId);
  const rows: BuyerWalletPaymentMethodDTO[] = [];

  for (const pmType of WALLET_PM_STRIPE_TYPES) {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: pmType });
    for (const pm of list.data) {
      const card = pm.card;
      const walletType = stripePmTypeToWalletType(pm.type, card?.wallet?.type ?? null);
      let brand = formatBrand(card?.brand ?? pm.type);
      let last4 = card?.last4 ?? "";
      if (pm.type === "link") {
        brand = "Link";
        last4 = pm.link?.email?.slice(-4) ?? "····";
      } else if (pm.type === "cashapp") {
        brand = "Cash App";
        last4 = pm.cashapp?.cashtag?.replace("$", "").slice(-4) ?? "····";
      } else if (pm.type === "paypal") {
        brand = "PayPal";
        last4 = pm.paypal?.payer_email?.slice(-4) ?? "····";
      } else if (pm.type === "amazon_pay") {
        brand = "Amazon Pay";
        last4 = "····";
      }
      rows.push({
        id: pm.id,
        type: walletType,
        brand,
        last4: last4 || "····",
        expMonth: card?.exp_month ?? 0,
        expYear: card?.exp_year ?? 0,
        isDefault: pm.id === defaultId,
      });
    }
  }

  return rows;
}

export async function setBuyerDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
  if (isVenmoWalletPaymentMethodId(paymentMethodId)) {
    const { setBuyerVenmoAsDefault } = await import("@/lib/paypal-buyer-venmo");
    await setBuyerVenmoAsDefault(userId);
    return;
  }
  if (isPayPalWalletPaymentMethodId(paymentMethodId)) {
    const { setBuyerPayPalWalletAsDefault } = await import("@/lib/paypal-buyer-wallet");
    await setBuyerPayPalWalletAsDefault(userId);
    return;
  }
  await assertPaymentMethodOwnedByUser(userId, paymentMethodId);
  const customerId = await ensureStripeCustomerIdForUser(userId);
  const stripe = getStripe();
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { buyerDefaultWalletPaymentMethodId: paymentMethodId },
  });
}

export async function detachBuyerPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
  if (isVenmoWalletPaymentMethodId(paymentMethodId)) {
    const { detachBuyerVenmo } = await import("@/lib/paypal-buyer-venmo");
    await detachBuyerVenmo(userId);
    return;
  }
  if (isPayPalWalletPaymentMethodId(paymentMethodId)) {
    const { detachBuyerPayPalWallet } = await import("@/lib/paypal-buyer-wallet");
    await detachBuyerPayPalWallet(userId);
    return;
  }
  await assertPaymentMethodOwnedByUser(userId, paymentMethodId);
  const stripe = getStripe();
  await stripe.paymentMethods.detach(paymentMethodId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { buyerDefaultWalletPaymentMethodId: true },
  });
  if (user?.buyerDefaultWalletPaymentMethodId === paymentMethodId) {
    await prisma.user.update({
      where: { id: userId },
      data: { buyerDefaultWalletPaymentMethodId: null },
    });
  }
}

/**
 * True when Stripe is off (local dev) or the buyer has a live-eligible saved PM
 * (card, Cash App Pay, Link, Amazon Pay, vaulted Venmo, or vaulted PayPal).
 */
export async function buyerHasCardOnFileForLiveBidding(userId: string): Promise<boolean> {
  if (!isStripeConfigured()) return true;
  if (await buyerHasVenmoOnFile(userId)) return true;
  if (await buyerHasPayPalWalletOnFile(userId)) return true;
  const pmId = await getBuyerDefaultCardPaymentMethodId(userId);
  return pmId != null;
}

/**
 * Stripe Customer default live-eligible PM when set; otherwise the first usable
 * card / Cash App / Link / Amazon Pay on the Customer.
 * Returns null when the buyer's preferred method is Venmo/PayPal (use PayPal-rail charge path).
 */
export async function getBuyerDefaultCardPaymentMethodId(userId: string): Promise<string | null> {
  const preferred = await prisma.user.findUnique({
    where: { id: userId },
    select: { buyerDefaultWalletPaymentMethodId: true },
  });
  const pref = preferred?.buyerDefaultWalletPaymentMethodId?.trim() ?? "";
  if (isPayPalRailWalletPaymentMethodId(pref)) return null;

  if (!isStripeConfigured()) return null;
  if (pref.startsWith("pm_")) {
    try {
      await assertPaymentMethodOwnedByUser(userId, pref);
      return pref;
    } catch {
      /* fall through to Stripe customer default */
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  const customerId = user?.stripeCustomerId?.trim();
  if (!customerId) return null;
  return resolveDefaultPaymentMethodId(customerId);
}

/** Preferred wallet id for live charges: `paypal_…`, `venmo_…`, or Stripe `pm_…`. */
export async function getBuyerPreferredWalletPaymentMethodId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      buyerDefaultWalletPaymentMethodId: true,
      venmoPaymentTokenId: true,
      paypalWalletPaymentTokenId: true,
    },
  });
  const pref = user?.buyerDefaultWalletPaymentMethodId?.trim() ?? "";
  if (isPayPalRailWalletPaymentMethodId(pref)) return pref;
  if (pref.startsWith("pm_")) return pref;

  const stripePm = await getBuyerDefaultCardPaymentMethodId(userId);
  if (stripePm) return stripePm;
  if (user?.paypalWalletPaymentTokenId?.trim()) {
    return `paypal_${user.paypalWalletPaymentTokenId.trim()}`;
  }
  if (user?.venmoPaymentTokenId?.trim()) {
    return `venmo_${user.venmoPaymentTokenId.trim()}`;
  }
  return null;
}

/**
 * Verifies the PaymentMethod is attached to this user's Stripe Customer.
 * @throws STRIPE_NOT_CONFIGURED, PM_NOT_OWNED, PM_NOT_FOUND
 */
export async function assertPaymentMethodOwnedByUser(userId: string, paymentMethodId: string): Promise<void> {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  const customerId = user?.stripeCustomerId?.trim();
  if (!customerId) {
    throw new Error("PM_NOT_OWNED");
  }

  const stripe = getStripe();
  let pm: Awaited<ReturnType<typeof stripe.paymentMethods.retrieve>>;
  try {
    pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  } catch {
    throw new Error("PM_NOT_FOUND");
  }

  const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (pmCustomer !== customerId) {
    throw new Error("PM_NOT_OWNED");
  }
}
