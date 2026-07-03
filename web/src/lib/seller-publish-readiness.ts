import type { PrismaClient } from "@/generated/prisma/client";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { hasCompleteSellerShipFrom } from "@/lib/seller-shipping-readiness";
import { isShippoConfigured } from "@/lib/shippo";

type Db = Pick<PrismaClient, "user">;

type ListingShippingProfile = {
  shippingBaseWeightOz: number;
  shippingIncrementalWeightOz: number;
  shippingCategory: string;
};

function listingShippingProfileValid(profile: ListingShippingProfile): boolean {
  return (
    Number.isFinite(profile.shippingBaseWeightOz) &&
    profile.shippingBaseWeightOz > 0 &&
    Number.isFinite(profile.shippingIncrementalWeightOz) &&
    profile.shippingIncrementalWeightOz >= 0 &&
    Boolean(String(profile.shippingCategory ?? "").trim())
  );
}

function stripeRequirementsClear(account: {
  details_submitted?: boolean | null;
  requirements?: { currently_due?: string[] | null; pending_verification?: string[] | null } | null;
}): boolean {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pendingVerification = account.requirements?.pending_verification ?? [];
  return Boolean(account.details_submitted) && currentlyDue.length === 0 && pendingVerification.length === 0;
}

export async function getSellerPublishListingIssues(
  db: Db,
  sellerId: string,
  profile: ListingShippingProfile,
): Promise<string[]> {
  const issues: string[] = [];
  const stripeRequired = isStripeConfigured();
  const shippoConfigured = isShippoConfigured();

  if (!shippoConfigured) {
    issues.push("Shippo is not configured (set SHIPPO_API_TOKEN).");
  }

  const user = await db.user.findUnique({
    where: { id: sellerId },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      defaultShipFromAddressId: true,
      shipFromName: true,
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
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
    return ["Seller account not found."];
  }

  if (stripeRequired) {
    const hasStripeAccount = Boolean(user.stripeAccountId?.trim());
    if (!hasStripeAccount) {
      issues.push("Connect Stripe payouts under Account → Seller.");
    } else {
      let onboardingComplete = Boolean(user.stripeOnboardingComplete);
      if (!onboardingComplete) {
        try {
          const stripe = getStripe();
          const account = await stripe.accounts.retrieve(user.stripeAccountId!);
          onboardingComplete = stripeRequirementsClear(account);
        } catch {
          // Keep fallback state from DB if Stripe retrieval fails.
        }
      }
      if (!onboardingComplete) {
        issues.push("Finish Stripe onboarding (submit required details and clear pending verification).");
      }
    }
  }

  if (!hasCompleteSellerShipFrom(user)) {
    issues.push("Add a complete ship-from address under Account → Seller.");
  }

  if (!listingShippingProfileValid(profile)) {
    issues.push("Set a valid listing shipping profile (base weight, incremental weight, and shipping category).");
  }

  return issues;
}

export async function assertSellerCanPublishListing(
  db: Db,
  sellerId: string,
  profile: ListingShippingProfile,
): Promise<void> {
  const issues = await getSellerPublishListingIssues(db, sellerId, profile);
  if (issues.length === 0) return;
  const err = new Error("SELLER_REQUIREMENTS_INCOMPLETE") as Error & { code?: string; issues?: string[] };
  err.code = "SELLER_REQUIREMENTS_INCOMPLETE";
  err.issues = issues;
  throw err;
}

