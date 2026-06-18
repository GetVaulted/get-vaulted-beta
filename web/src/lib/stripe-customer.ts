import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  stripePmTypeToWalletType,
  type BuyerWalletPaymentMethodDTO,
} from "@/lib/payment-processor";

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

const WALLET_PM_STRIPE_TYPES = ["card", "link", "cashapp", "paypal"] as const;

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
  if (defaultId) return defaultId;

  const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
  const valid = cards.data.find((pm) => {
    const expMonth = pm.card?.exp_month ?? 0;
    const expYear = pm.card?.exp_year ?? 0;
    return !isCardExpired(expMonth, expYear);
  });
  return valid?.id ?? cards.data[0]?.id ?? null;
}

/** All saved wallet payment methods on the Stripe Customer (cards, Link, Cash App, PayPal). */
export async function listBuyerWalletPaymentMethods(userId: string): Promise<BuyerWalletPaymentMethodDTO[]> {
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
  await assertPaymentMethodOwnedByUser(userId, paymentMethodId);
  const customerId = await ensureStripeCustomerIdForUser(userId);
  const stripe = getStripe();
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

export async function detachBuyerPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
  await assertPaymentMethodOwnedByUser(userId, paymentMethodId);
  const stripe = getStripe();
  await stripe.paymentMethods.detach(paymentMethodId);
}

/** True when Stripe is off (local dev) or the buyer has at least one saved card on their Customer. */
export async function buyerHasCardOnFileForLiveBidding(userId: string): Promise<boolean> {
  if (!isStripeConfigured()) return true;
  const cards = await listBuyerCardPaymentMethods(userId);
  return cards.length > 0;
}

/**
 * Stripe Customer default card PM when set; otherwise the first saved card from the Customer.
 * Used to charge live auction wins when `Order.paymentLabel` is still the placeholder `"auction"`.
 */
export async function getBuyerDefaultCardPaymentMethodId(userId: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  const customerId = user?.stripeCustomerId?.trim();
  if (!customerId) return null;

  const defaultId = await resolveDefaultPaymentMethodId(customerId);
  if (!defaultId) return null;

  const stripe = getStripe();
  try {
    const pm = await stripe.paymentMethods.retrieve(defaultId);
    const expMonth = pm.card?.exp_month ?? 0;
    const expYear = pm.card?.exp_year ?? 0;
    if (!isCardExpired(expMonth, expYear)) return defaultId;
  } catch {
    /* fall through */
  }

  const cards = await listBuyerCardPaymentMethods(userId);
  const valid = cards.find((card) => !isCardExpired(card.expMonth, card.expYear));
  return valid?.id ?? cards[0]?.id ?? null;
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
