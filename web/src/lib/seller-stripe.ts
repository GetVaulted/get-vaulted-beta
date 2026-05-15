import type { PrismaClient } from "@/generated/prisma/client";
import { isStripeConfigured } from "@/lib/stripe";

/**
 * Sellers must finish Stripe Connect onboarding before publishing listings or going live.
 * When Stripe is not configured (local dev), checks are skipped — TODO: tighten for staging.
 */
export async function assertSellerStripeCollectReady(
  prisma: Pick<PrismaClient, "user">,
  sellerId: string,
): Promise<void> {
  if (!isStripeConfigured()) return;
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!u?.stripeAccountId || !u.stripeOnboardingComplete) {
    const err = new Error("STRIPE_ONBOARDING_REQUIRED");
    (err as Error & { code?: string }).code = "STRIPE_ONBOARDING_REQUIRED";
    throw err;
  }
}
