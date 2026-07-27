import type { PaymentProcessor, SellerPayoutProcessor, WalletPaymentMethodType } from "@/generated/prisma/client";

export type { PaymentProcessor, SellerPayoutProcessor, WalletPaymentMethodType };

/** Stripe-supported wallet methods we expose in Vault Wallet (Venmo is a separate PayPal path). */
export const STRIPE_WALLET_METHOD_TYPES: WalletPaymentMethodType[] = [
  "card",
  "apple_pay",
  "google_pay",
  "link",
  "cash_app_pay",
  "paypal",
];

/** Buyer Venmo option in Vault Wallet / Live. Backend link lives at POST /api/account/payment-methods/venmo-setup. */
export function isWalletVenmoEnabled(): boolean {
  return process.env.WALLET_VENMO_ENABLED !== "false";
}

export type WalletCapabilities = {
  stripeConfigured: boolean;
  card: boolean;
  applePay: boolean;
  googlePay: boolean;
  link: boolean;
  cashAppPay: boolean;
  amazonPay: boolean;
  paypal: boolean;
  /** PayPal/Venmo buyer rail — UI option; linking completed via venmo-setup API. */
  venmo: boolean;
};

export type BuyerWalletPaymentMethodDTO = {
  id: string;
  type: WalletPaymentMethodType;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export type BuyerWalletSummaryDTO = {
  paymentReady: boolean;
  shippingReady: boolean;
  walletReady: boolean;
  vaultCreditsUsd: number;
  /** Spendable now (past the return/dispute hold window). */
  referralCreditUsd: number;
  /** Earned but still inside the hold window — not yet spendable. */
  referralCreditPendingUsd: number;
  /** Referrer's own username — the referral code, and the `?ref=` value for their join link. */
  referralCode: string;
  /** Count of distinct friends who have earned this user a referrer credit (excludes voided). */
  referralSuccessfulReferrals: number;
  promoCodeApplied: string | null;
  promoDiscountUsd: number;
  stripePublishableKey: string | null;
  capabilities: WalletCapabilities;
  defaultPaymentMethod: BuyerWalletPaymentMethodDTO | null;
  paymentMethods: BuyerWalletPaymentMethodDTO[];
  defaultShippingAddressId: string | null;
};

export function defaultWalletCapabilities(stripeConfigured: boolean): WalletCapabilities {
  return {
    stripeConfigured,
    card: stripeConfigured,
    applePay: stripeConfigured,
    googlePay: stripeConfigured,
    link: stripeConfigured && process.env.STRIPE_WALLET_LINK_ENABLED === "true",
    cashAppPay: stripeConfigured && process.env.STRIPE_WALLET_CASH_APP_ENABLED === "true",
    amazonPay: stripeConfigured && process.env.STRIPE_WALLET_AMAZON_PAY_ENABLED === "true",
    paypal: false,
    venmo: isWalletVenmoEnabled(),
  };
}

export function stripePmTypeToWalletType(
  stripeType: string,
  wallet?: string | null,
): WalletPaymentMethodType {
  const t = stripeType.toLowerCase();
  if (t === "card") {
    const w = (wallet ?? "").toLowerCase();
    if (w.includes("apple")) return "apple_pay";
    if (w.includes("google")) return "google_pay";
    return "card";
  }
  if (t === "link") return "link";
  if (t === "cashapp") return "cash_app_pay";
  if (t === "paypal") return "paypal";
  if (t === "amazon_pay") return "card";
  return "card";
}

export function walletMethodLabel(type: WalletPaymentMethodType, brand: string): string {
  switch (type) {
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    case "link":
      return "Link";
    case "cash_app_pay":
      return "Cash App Pay";
    case "paypal":
      return "PayPal";
    case "venmo":
      return "Venmo";
    default: {
      const b = brand?.trim();
      if (b?.toLowerCase() === "amazon pay") return "Amazon Pay";
      return b || "Card";
    }
  }
}

export function orderPaymentProcessorLabel(processor: PaymentProcessor): string {
  return processor === "PAYPAL_VENMO" ? "PayPal / Venmo" : "Stripe";
}

export function sellerPayoutProcessorLabel(processor: SellerPayoutProcessor): string {
  return processor === "PAYPAL" ? "PayPal" : "Stripe Connect";
}

export function shouldUseStripeConnectPayout(processor: PaymentProcessor): boolean {
  return processor === "STRIPE";
}

/** Buyer charge stays on platform when seller payout rail is PayPal. */
export function shouldUsePlatformHeldStripeCharge(
  sellerPayoutProcessor: SellerPayoutProcessor,
): boolean {
  return sellerPayoutProcessor === "PAYPAL";
}
