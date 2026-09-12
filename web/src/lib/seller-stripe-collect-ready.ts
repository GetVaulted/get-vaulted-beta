import type { PrismaClient, SellerPayoutProcessor } from "@/generated/prisma/client";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import {
  effectiveSellerPayoutProcessor,
  isSellerPayoutRailReady,
  sellerPayoutRailNotReadyMessage,
  sellerUsesPayPalPayout,
  type SellerPayoutRailSnapshot,
} from "@/lib/seller-payout-rail";
import { parseRequirementsDue } from "@/lib/stripe-connect-status-response";
import { isStripeConfigured } from "@/lib/stripe";

/** Fields required to evaluate whether a seller can collect payments (Stripe or PayPal rail). */
export const sellerStripeCollectSelect = {
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: true,
  preferredSellerPayoutProcessor: true,
  paypalPayoutEmail: true,
  paypalPayoutVerifiedAt: true,
} as const;

export type SellerStripeCollectSlice = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  stripeRequirementsDue: unknown;
  preferredSellerPayoutProcessor?: SellerPayoutProcessor;
  paypalPayoutEmail?: string | null;
  paypalPayoutVerifiedAt?: Date | null;
};

function toRailSnapshot(user: SellerStripeCollectSlice): SellerPayoutRailSnapshot {
  return {
    preferredSellerPayoutProcessor: user.preferredSellerPayoutProcessor ?? "STRIPE",
    stripeAccountId: user.stripeAccountId,
    stripeOnboardingComplete: user.stripeOnboardingComplete,
    paypalPayoutEmail: user.paypalPayoutEmail ?? null,
    paypalPayoutVerifiedAt: user.paypalPayoutVerifiedAt ?? null,
  };
}

export function getSellerStripeCollectIssues(user: SellerStripeCollectSlice | null | undefined): string[] {
  if (!isStripeConfigured() && !isPayPalSellerPayoutsEnabled()) return [];
  if (!user) return ["Seller account not found."];

  const rail = toRailSnapshot(user);
  if (sellerUsesPayPalPayout(rail)) {
    if (!isSellerPayoutRailReady(rail)) {
      return [sellerPayoutRailNotReadyMessage(rail)];
    }
    return [];
  }

  if (!isStripeConfigured()) return [];
  const issues: string[] = [];
  if (!user.stripeAccountId?.trim()) {
    issues.push("Stripe Connect account missing.");
  }
  const req = parseRequirementsDue(user.stripeRequirementsDue);
  if (req?.disabledReason) {
    issues.push("Stripe account is restricted.");
  }
  if (req && (req.currentlyDue.length > 0 || req.pendingVerification.length > 0)) {
    issues.push("Stripe requires additional verification.");
  }
  if (!user.stripeOnboardingComplete) {
    if (user.stripeChargesEnabled !== true || user.stripePayoutsEnabled !== true) {
      issues.push("Stripe onboarding incomplete.");
    }
  }
  return issues;
}

export function sellerStripeCollectReady(user: SellerStripeCollectSlice | null | undefined): boolean {
  return getSellerStripeCollectIssues(user).length === 0;
}

/** Same bar as live buy-now saved-card checkout — PayPal rail or Stripe Connect ready. */
export function liveSavedCardSellerReady(user: SellerStripeCollectSlice | null | undefined): boolean {
  if (!user) return false;
  if (!isStripeConfigured() && !isPayPalSellerPayoutsEnabled()) return true;
  return isSellerPayoutRailReady(toRailSnapshot(user));
}

export function resolveLiveSellerPayoutProcessor(
  user: SellerStripeCollectSlice | null | undefined,
): SellerPayoutProcessor {
  if (!user) return "STRIPE";
  return effectiveSellerPayoutProcessor(toRailSnapshot(user));
}

/** Connect destination account id, or null when platform-held (PayPal rail). */
export function resolveLiveSellerDestinationAccount(
  user: SellerStripeCollectSlice | null | undefined,
): string | null {
  if (!user) return null;
  if (resolveLiveSellerPayoutProcessor(user) === "PAYPAL") return null;
  return user.stripeAccountId?.trim() || null;
}

export function assertSellerStripeCollectReadyFromUser(user: SellerStripeCollectSlice | null | undefined): void {
  if (!isStripeConfigured() && !isPayPalSellerPayoutsEnabled()) return;
  if (!sellerStripeCollectReady(user)) {
    const err = new Error("STRIPE_ONBOARDING_REQUIRED");
    (err as Error & { code?: string }).code = "STRIPE_ONBOARDING_REQUIRED";
    throw err;
  }
}

export async function assertSellerStripeCollectReady(
  prisma: Pick<PrismaClient, "user">,
  sellerId: string,
): Promise<void> {
  if (!isStripeConfigured() && !isPayPalSellerPayoutsEnabled()) return;
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: sellerStripeCollectSelect,
  });
  assertSellerStripeCollectReadyFromUser(u);
}
