/**
 * Commerce-scoped Stripe payment method rules.
 * Dashboard may enable BNPL/ACH globally — app code restricts by lane.
 */

import type Stripe from "stripe";

export type CommercePaymentLane = "live" | "marketplace" | "trade";

type StripeCheckoutPaymentMethodType = Stripe.Checkout.SessionCreateParams.PaymentMethodType;

/** Instant-confirming methods allowed for Live, Trade, and wallet setup (off-session). */
export const INSTANT_STRIPE_PAYMENT_METHOD_TYPES = [
  "card",
  "link",
  "cashapp",
  "amazon_pay",
] as const satisfies readonly StripeCheckoutPaymentMethodType[];

export type InstantStripePaymentMethodType = (typeof INSTANT_STRIPE_PAYMENT_METHOD_TYPES)[number];

/** BNPL — Marketplace hosted checkout only; never Live/Trade/wallet setup. */
export const MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES = [
  "affirm",
  "klarna",
  "afterpay_clearpay",
] as const satisfies readonly StripeCheckoutPaymentMethodType[];

export type MarketplaceBnplStripePaymentMethodType =
  (typeof MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES)[number];

/** Delayed / async methods — never allowed in Get Vaulted checkout flows. */
export const BLOCKED_STRIPE_PAYMENT_METHOD_TYPES = [
  "us_bank_account",
  "acss_debit",
  "bacs_debit",
  "sepa_debit",
  "customer_balance",
] as const;

export type WalletMethodEligibility = "live" | "marketplace" | "trade" | "marketplace_only";

export type WalletMethodCatalogEntry = {
  id: string;
  label: string;
  eligibility: WalletMethodEligibility[];
  /** False for BNPL — shown for Marketplace checkout only, not saved in wallet. */
  savableInWallet: boolean;
};

export const WALLET_METHOD_CATALOG: WalletMethodCatalogEntry[] = [
  {
    id: "apple_pay",
    label: "Apple Pay",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "google_pay",
    label: "Google Pay",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "card",
    label: "Credit / Debit Card",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "cash_app_pay",
    label: "Cash App Pay",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "link",
    label: "Link",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "amazon_pay",
    label: "Amazon Pay",
    eligibility: ["live", "marketplace", "trade"],
    savableInWallet: true,
  },
  {
    id: "affirm",
    label: "Affirm",
    eligibility: ["marketplace_only"],
    savableInWallet: false,
  },
  {
    id: "klarna",
    label: "Klarna",
    eligibility: ["marketplace_only"],
    savableInWallet: false,
  },
  {
    id: "afterpay_clearpay",
    label: "Afterpay / Clearpay",
    eligibility: ["marketplace_only"],
    savableInWallet: false,
  },
];

const ELIGIBILITY_LABELS: Record<WalletMethodEligibility, string> = {
  live: "Live",
  marketplace: "Marketplace",
  trade: "Trade",
  marketplace_only: "Marketplace checkout only",
};

export function walletMethodEligibilityLabel(entry: WalletMethodCatalogEntry): string {
  if (entry.eligibility.length === 1 && entry.eligibility[0] === "marketplace_only") {
    return ELIGIBILITY_LABELS.marketplace_only;
  }
  const parts = entry.eligibility
    .filter((e) => e !== "marketplace_only")
    .map((e) => ELIGIBILITY_LABELS[e]);
  return parts.length ? `Available for ${parts.join(", ")}` : ELIGIBILITY_LABELS.marketplace_only;
}

export function checkoutPaymentMethodTypesForLane(
  lane: CommercePaymentLane,
): StripeCheckoutPaymentMethodType[] {
  if (lane === "marketplace") {
    return [...INSTANT_STRIPE_PAYMENT_METHOD_TYPES, ...MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES];
  }
  return [...INSTANT_STRIPE_PAYMENT_METHOD_TYPES];
}

export function stripeCheckoutSessionPaymentOptions(lane: CommercePaymentLane): {
  payment_method_types: StripeCheckoutPaymentMethodType[];
} {
  return { payment_method_types: checkoutPaymentMethodTypesForLane(lane) };
}

/** Wallet SetupIntent — instant methods only (saved PMs used for Live off-session). */
export function stripeSetupIntentPaymentOptions(): {
  payment_method_types: StripeCheckoutPaymentMethodType[];
} {
  return { payment_method_types: [...INSTANT_STRIPE_PAYMENT_METHOD_TYPES] };
}

/**
 * Off-session / saved-card PaymentIntent recovery — instant methods only, no redirects.
 * Used when a PaymentIntent may need client-side confirmation without BNPL/ACH.
 */
export function stripeOffSessionPaymentIntentOptions(lane: "live" | "marketplace"): {
  payment_method_types: StripeCheckoutPaymentMethodType[];
} {
  void lane;
  return { payment_method_types: [...INSTANT_STRIPE_PAYMENT_METHOD_TYPES] };
}

export function resolveBuyNowCheckoutLane(liveRoomItemId?: string | null): CommercePaymentLane {
  return liveRoomItemId?.trim() ? "live" : "marketplace";
}

export function resolveOrderCheckoutLane(args: {
  liveShippingSessionId?: string | null;
  liveRoomItemId?: string | null;
}): CommercePaymentLane {
  if (args.liveShippingSessionId?.trim() || args.liveRoomItemId?.trim()) return "live";
  return "marketplace";
}

export function paymentMethodTypesIncludeBnpl(types: readonly string[]): boolean {
  return MARKETPLACE_BNPL_STRIPE_PAYMENT_METHOD_TYPES.some((t) => types.includes(t));
}

export function paymentMethodTypesIncludeBlockedDelayed(types: readonly string[]): boolean {
  return BLOCKED_STRIPE_PAYMENT_METHOD_TYPES.some((t) => types.includes(t));
}

export function assertLivePaymentMethodPolicy(types: readonly string[]): void {
  if (paymentMethodTypesIncludeBnpl(types)) {
    throw new Error("LIVE_CHECKOUT_BNPL_NOT_ALLOWED");
  }
  if (paymentMethodTypesIncludeBlockedDelayed(types)) {
    throw new Error("LIVE_CHECKOUT_DELAYED_PAYMENT_NOT_ALLOWED");
  }
}
