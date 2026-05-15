import Stripe from "stripe";

/** Server Stripe client; use live `STRIPE_SECRET_KEY` in production. */
let stripeSingleton: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.length > 10);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeSingleton;
}

export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return s;
}

export function getStripePublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
}

export function getPlatformFeePercent(): number {
  const raw = process.env.STRIPE_PLATFORM_FEE_PERCENT;
  const n = raw != null ? Number(raw) : 10;
  if (!Number.isFinite(n) || n < 0 || n > 100) return 10;
  return n;
}

/** Application fee in cents for Stripe Connect (from item + shipping subtotal). */
export function platformFeeCentsFromSubtotalUsd(subtotalUsd: number): number {
  const pct = getPlatformFeePercent();
  const feeUsd = (subtotalUsd * pct) / 100;
  return Math.max(0, Math.round(feeUsd * 100));
}

/**
 * Marketplace Connect application fee: zero for official company/merch listings so the platform
 * does not take a seller marketplace fee on those checkouts.
 */
export function marketplaceApplicationFeeCents(subtotalUsd: number, isCompanyListing: boolean): number {
  if (isCompanyListing) return 0;
  return platformFeeCentsFromSubtotalUsd(subtotalUsd);
}

export function constructStripeWebhookEvent(payload: string | Buffer, signature: string | null): Stripe.Event {
  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }
  return getStripe().webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
}
