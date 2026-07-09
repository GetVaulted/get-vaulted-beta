import Stripe from "stripe";
import {
  applicationFeeCentsFromSubtotalUsd,
  liveShowApplicationFeeCents,
  marketplaceApplicationFeeCents,
  marketplacePlatformFeePercent,
} from "@/lib/platform-fee-policy";

export {
  applicationFeeCentsFromSubtotalUsd,
  liveShowApplicationFeeCents,
  marketplaceApplicationFeeCents,
  marketplacePlatformFeePercent,
};

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

/** Platform/payments webhook signing secret (get-vaulted-production). */
export function getStripeWebhookSecret(): string {
  const secrets = listStripeWebhookSecrets();
  if (!secrets.length) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secrets[0]!;
}

/**
 * All webhook signing secrets to verify — platform first, then Connect (get-vaulted-connect).
 * STRIPE_CONNECT_WEBHOOK_SECRET is optional but recommended when Connect has its own destination.
 */
export function listStripeWebhookSecrets(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of ["STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET"] as const) {
    const value = process.env[key]?.trim();
    if (!value || !value.startsWith("whsec_") || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function getStripePublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
}

/** @deprecated Prefer `marketplacePlatformFeePercent()` — marketplace listings use a fixed 8%. */
export function getPlatformFeePercent(): number {
  const raw = process.env.STRIPE_PLATFORM_FEE_PERCENT;
  const n = raw != null ? Number(raw) : 10;
  if (!Number.isFinite(n) || n < 0 || n > 100) return 10;
  return n;
}

/** Application fee in cents for Stripe Connect (marketplace flat 8%). */
export function platformFeeCentsFromSubtotalUsd(subtotalUsd: number): number {
  return applicationFeeCentsFromSubtotalUsd(subtotalUsd, marketplacePlatformFeePercent());
}

export function constructStripeWebhookEvent(payload: string | Buffer, signature: string | null): Stripe.Event {
  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }
  const secrets = listStripeWebhookSecrets();
  if (!secrets.length) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  const stripe = getStripe();
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid webhook signature");
}
