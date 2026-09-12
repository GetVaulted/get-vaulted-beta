import type { PrismaClient } from "@/generated/prisma/client";
import {
  isSellerPayoutRailReady,
  sellerPayoutRailNotReadyMessage,
  sellerPayoutRailSelect,
} from "@/lib/seller-payout-rail";
import { isStripeConfigured } from "@/lib/stripe";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";

/**
 * Sellers must finish their chosen payout rail before publishing listings or going live.
 * Stripe Connect (default) or verified PayPal payout email when enabled.
 * When neither Stripe nor PayPal seller payouts are configured (local dev), checks are skipped.
 */
export async function assertSellerStripeCollectReady(
  prisma: Pick<PrismaClient, "user">,
  sellerId: string,
): Promise<void> {
  if (!isStripeConfigured() && !isPayPalSellerPayoutsEnabled()) return;
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: sellerPayoutRailSelect,
  });
  if (!u || !isSellerPayoutRailReady(u)) {
    const err = new Error(
      u ? sellerPayoutRailNotReadyMessage(u) : "STRIPE_ONBOARDING_REQUIRED",
    );
    (err as Error & { code?: string }).code = "STRIPE_ONBOARDING_REQUIRED";
    throw err;
  }
}

/** Alias — prefer this name in new call sites. */
export const assertSellerPayoutCollectReady = assertSellerStripeCollectReady;
