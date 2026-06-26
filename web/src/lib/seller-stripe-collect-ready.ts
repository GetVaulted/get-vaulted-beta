import type { PrismaClient } from "@/generated/prisma/client";
import { parseRequirementsDue } from "@/lib/stripe-connect-status-response";
import { isStripeConfigured } from "@/lib/stripe";

/** Fields required to evaluate whether a seller can collect payments. */
export const sellerStripeCollectSelect = {
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: true,
} as const;

export type SellerStripeCollectSlice = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  stripeRequirementsDue: unknown;
};

export function getSellerStripeCollectIssues(user: SellerStripeCollectSlice | null | undefined): string[] {
  if (!isStripeConfigured()) return [];
  if (!user) return ["Seller account not found."];
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

export function assertSellerStripeCollectReadyFromUser(user: SellerStripeCollectSlice | null | undefined): void {
  if (!isStripeConfigured()) return;
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
  if (!isStripeConfigured()) return;
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: sellerStripeCollectSelect,
  });
  assertSellerStripeCollectReadyFromUser(u);
}
