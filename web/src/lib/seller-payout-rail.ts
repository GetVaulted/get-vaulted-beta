import type { SellerPayoutProcessor } from "@/generated/prisma/client";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import { isStripeConfigured } from "@/lib/stripe";

export type SellerPayoutRailSnapshot = {
  preferredSellerPayoutProcessor: SellerPayoutProcessor;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: Date | null;
};

/** Effective rail: PayPal only when feature flag is on and seller chose PAYPAL. */
export function effectiveSellerPayoutProcessor(
  seller: Pick<SellerPayoutRailSnapshot, "preferredSellerPayoutProcessor">,
): SellerPayoutProcessor {
  if (
    seller.preferredSellerPayoutProcessor === "PAYPAL" &&
    isPayPalSellerPayoutsEnabled()
  ) {
    return "PAYPAL";
  }
  return "STRIPE";
}

export function sellerUsesPayPalPayout(
  seller: Pick<SellerPayoutRailSnapshot, "preferredSellerPayoutProcessor">,
): boolean {
  return effectiveSellerPayoutProcessor(seller) === "PAYPAL";
}

/** True when the seller's chosen payout rail is ready to accept sales. */
export function isSellerPayoutRailReady(seller: SellerPayoutRailSnapshot): boolean {
  if (sellerUsesPayPalPayout(seller)) {
    return (
      Boolean(seller.paypalPayoutEmail?.trim()) && seller.paypalPayoutVerifiedAt != null
    );
  }
  if (!isStripeConfigured()) return true;
  return Boolean(seller.stripeAccountId?.trim() && seller.stripeOnboardingComplete);
}

export function sellerPayoutRailNotReadyMessage(seller: SellerPayoutRailSnapshot): string {
  if (sellerUsesPayPalPayout(seller)) {
    if (!seller.paypalPayoutEmail?.trim()) {
      return "Add and verify a PayPal payout email under Seller payout settings.";
    }
    if (!seller.paypalPayoutVerifiedAt) {
      return "Verify your PayPal payout email before listing or going live.";
    }
    return "PayPal payouts are not ready.";
  }
  return "Connect Stripe payouts under Account → Seller.";
}

export const sellerPayoutRailSelect = {
  preferredSellerPayoutProcessor: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  paypalPayoutEmail: true,
  paypalPayoutVerifiedAt: true,
} as const;

/** Normalize and lightly validate a PayPal payout email. */
export function normalizePayPalPayoutEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
