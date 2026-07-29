import type { PrismaClient } from "@/generated/prisma/client";
import { isEscrowConfigured, isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import type { LiveShowReadiness, LiveShowReadinessChecks } from "@/lib/live-show-readiness-types";
import { prisma } from "@/lib/prisma";
import {
  effectiveSellerPayoutProcessor,
  isSellerPayoutRailReady,
  sellerPayoutRailNotReadyMessage,
} from "@/lib/seller-payout-rail";
import { hasCompleteSellerShipFrom, sellerNeedsShipFromPhoneOnly } from "@/lib/seller-shipping-readiness";
import { isShippoConfigured } from "@/lib/shippo";
import { isStripeConfigured } from "@/lib/stripe";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import { parseRequirementsDue } from "@/lib/stripe-connect-status-response";
import { isStripePayoutSetupSubmitted } from "@/lib/stripe-payout-submitted";

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
 * Enforces seller setup before starting a live show (payouts, Shippo labels, ship-from,
 * listing shipping profile, alternate checkout seller link when that path is on).
 *
 * Sellers on the PayPal payout rail skip Stripe Connect when their PayPal email is verified.
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
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeRequirementsDue: true,
      preferredSellerPayoutProcessor: true,
      paypalPayoutEmail: true,
      paypalPayoutVerifiedAt: true,
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
        stripePayoutSubmitted: false,
        paypalPayoutReady: false,
        paypalSellerPayoutsEnabled: isPayPalSellerPayoutsEnabled(),
        preferredSellerPayoutProcessor: "STRIPE",
        hasShippoConfigured: isShippoConfigured(),
        hasShipFromAddress: false,
        alternateCheckoutSellerReady: false,
        hasAtLeastOneListingWithShippingProfile: false,
      },
    };
  }

  const preferred = effectiveSellerPayoutProcessor(user);
  const payoutRail = {
    preferredSellerPayoutProcessor: user.preferredSellerPayoutProcessor,
    stripeAccountId: user.stripeAccountId,
    stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
    paypalPayoutEmail: user.paypalPayoutEmail,
    paypalPayoutVerifiedAt: user.paypalPayoutVerifiedAt,
  };
  const paypalPayoutReady = preferred === "PAYPAL" && isSellerPayoutRailReady(payoutRail);

  const stripeRequired = isStripeConfigured() && preferred === "STRIPE";
  const hasStripeAccount = Boolean(user.stripeAccountId?.trim());
  const stripeChargesEnabled =
    paypalPayoutReady || !stripeRequired || Boolean(user.stripeOnboardingComplete);
  const requirementsSnap = parseRequirementsDue(user.stripeRequirementsDue);
  const stripePayoutSubmitted =
    paypalPayoutReady ||
    !stripeRequired ||
    isStripePayoutSetupSubmitted({
      hasStripeAccount,
      stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
      stripeChargesEnabled: user.stripeChargesEnabled ?? null,
      stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
      currentlyDue: requirementsSnap?.currentlyDue ?? [],
      pendingVerification: requirementsSnap?.pendingVerification ?? [],
    });

  const hasShippoConfigured = isShippoConfigured();
  const hasShipFromAddress =
    hasCompleteSellerShipFrom(user) || sellerNeedsShipFromPhoneOnly(user);
  const hasShipFromPhone = hasCompleteSellerShipFrom(user);

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
    hasStripeAccount: paypalPayoutReady || !stripeRequired || hasStripeAccount,
    stripeChargesEnabled,
    stripePayoutSubmitted,
    paypalPayoutReady,
    paypalSellerPayoutsEnabled: isPayPalSellerPayoutsEnabled(),
    preferredSellerPayoutProcessor: preferred,
    hasShippoConfigured,
    hasShipFromAddress,
    alternateCheckoutSellerReady: !alternateCheckoutSellerRequired || alternateCheckoutSellerLinked,
    hasAtLeastOneListingWithShippingProfile,
  };

  if (preferred === "PAYPAL") {
    if (!paypalPayoutReady) {
      issues.push(sellerPayoutRailNotReadyMessage(payoutRail));
    }
  } else if (stripeRequired) {
    if (!hasStripeAccount) {
      issues.push("Set up payouts so buyers can purchase from your live room.");
    } else if (!user.stripeOnboardingComplete) {
      issues.push("Finish setting up payouts to start your live room.");
    }
  }

  if (!hasShipFromAddress) {
    issues.push(
      "Add a complete ship-from address and contact phone so we can buy USPS labels for your orders.",
    );
  } else if (!hasShipFromPhone) {
    issues.push(
      "Add a contact phone for your saved ship-from address so we can buy USPS labels for your orders.",
    );
  }

  if (alternateCheckoutSellerRequired && !alternateCheckoutSellerLinked) {
    issues.push(
      "Complete high-value checkout seller setup before going live (link the seller account in admin/tools).",
    );
  }

  return { canGoLive: issues.length === 0, issues, checks };
}
