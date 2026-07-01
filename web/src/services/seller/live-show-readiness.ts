import type { PrismaClient } from "@/generated/prisma/client";
import { isEscrowConfigured, isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import type { LiveShowReadiness, LiveShowReadinessChecks } from "@/lib/live-show-readiness-types";
import { prisma } from "@/lib/prisma";
import { hasCompleteSellerShipFrom } from "@/lib/seller-shipping-readiness";
import { isShippoConfigured } from "@/lib/shippo";
import { isStripeConfigured } from "@/lib/stripe";

export type { LiveShowReadiness, LiveShowReadinessChecks } from "@/lib/live-show-readiness-types";

/** When high-value alternate checkout is enabled (not stub), seller must link the provider account before going live. */
export function isLiveAlternateCheckoutSellerRequired(): boolean {
  return (
    isEscrowFeaturesEnabled() && isEscrowConfigured() && process.env.TRUSTAP_USE_STUB_RESPONSE === "0"
  );
}

function listingRowHasShippingProfile(row: {
  shippingBaseWeightOz: number;
  shippingIncrementalWeightOz: number;
  shippingCategory: string;
}): boolean {
  return (
    Number.isFinite(row.shippingBaseWeightOz) &&
    row.shippingBaseWeightOz > 0 &&
    Number.isFinite(row.shippingIncrementalWeightOz) &&
    row.shippingIncrementalWeightOz >= 0 &&
    Boolean(String(row.shippingCategory ?? "").trim())
  );
}

type ReadinessDb = Pick<PrismaClient, "user" | "listing">;

/**
 * Enforces seller setup before starting a live show (Stripe payouts, Shippo labels, ship-from, listing shipping profile, alternate checkout seller link when that path is on).
 *
 * When Stripe or Shippo env is not configured (typical local dev), those gates are skipped — same pattern as seller Stripe publish / payout gates.
 */
export async function getSellerLiveReadiness(
  sellerId: string,
  db: ReadinessDb = prisma,
): Promise<LiveShowReadiness> {
  const issues: string[] = [];

  const user = await db.user.findUnique({
    where: { id: sellerId },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      defaultShipFromAddressId: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
      trustapUserId: true,
      defaultShipFromAddress: {
        select: {
          line1: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          phone: true,
        },
      },
    },
  });

  if (!user) {
    return {
      canGoLive: false,
      issues: ["Seller account not found."],
      checks: {
        hasStripeAccount: false,
        stripeChargesEnabled: false,
        hasShippoConfigured: isShippoConfigured(),
        hasShipFromAddress: false,
        alternateCheckoutSellerReady: false,
        hasAtLeastOneListingWithShippingProfile: false,
      },
    };
  }

  const stripeRequired = isStripeConfigured();
  const hasStripeAccount = Boolean(user.stripeAccountId?.trim());
  /**
   * Mirrors Stripe onboarding completion (details submitted + no currently_due / pending_verification requirements),
   * synchronized from Stripe webhooks/status checks.
   */
  const stripeChargesEnabled = !stripeRequired || Boolean(user.stripeOnboardingComplete);

  const hasShippoConfigured = isShippoConfigured();
  const hasShipFromAddress = hasCompleteSellerShipFrom(user);

  const alternateCheckoutSellerRequired = isLiveAlternateCheckoutSellerRequired();
  const alternateCheckoutSellerLinked = Boolean(user.trustapUserId?.trim());

  const listingRow = await db.listing.findFirst({
    where: {
      sellerId,
      status: "active",
      shippingBaseWeightOz: { gt: 0 },
    },
    select: { shippingCategory: true, shippingBaseWeightOz: true, shippingIncrementalWeightOz: true },
  });
  const hasAtLeastOneListingWithShippingProfile = Boolean(
    listingRow && listingRowHasShippingProfile(listingRow),
  );

  const checks: LiveShowReadinessChecks = {
    hasStripeAccount: !stripeRequired || hasStripeAccount,
    stripeChargesEnabled,
    hasShippoConfigured,
    hasShipFromAddress,
    alternateCheckoutSellerReady: !alternateCheckoutSellerRequired || alternateCheckoutSellerLinked,
    hasAtLeastOneListingWithShippingProfile,
  };

  /**
   * Requirement rule:
   * - Only payouts setup + shipping address block going live.
   * - Everything else is optional (recommended).
   */
  if (stripeRequired) {
    if (!hasStripeAccount) {
      issues.push("Set up payouts so buyers can purchase from your live room.");
    } else if (!user.stripeOnboardingComplete) {
      issues.push("Finish setting up payouts to start your live room.");
    }
  }

  if (!hasShipFromAddress) {
    issues.push("Add a complete ship-from address and contact phone so we can buy USPS labels for your orders.");
  }

  if (alternateCheckoutSellerRequired && !alternateCheckoutSellerLinked) {
    issues.push("Complete high-value checkout seller setup before going live (link the seller account in admin/tools).");
  }

  const canGoLive = issues.length === 0;

  return { canGoLive, issues, checks };
}
