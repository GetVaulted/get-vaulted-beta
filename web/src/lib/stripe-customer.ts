import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export type BuyerCardPaymentMethodRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

function formatBrand(brand: string | null | undefined): string {
  const b = (brand ?? "card").toLowerCase();
  if (b === "amex") return "American Express";
  if (b === "diners") return "Diners Club";
  return b.slice(0, 1).toUpperCase() + b.slice(1);
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
  const list = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });

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

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return null;
  const dpm = customer.invoice_settings?.default_payment_method;
  if (typeof dpm === "string" && dpm.startsWith("pm_")) return dpm;
  if (dpm && typeof dpm === "object" && "id" in dpm) {
    const id = (dpm as { id: string }).id;
    if (typeof id === "string" && id.startsWith("pm_")) return id;
  }
  const cards = await listBuyerCardPaymentMethods(userId);
  return cards[0]?.id ?? null;
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
