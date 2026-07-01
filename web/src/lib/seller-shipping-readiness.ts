import type { ListingStatus } from "@/generated/prisma/client";
import { hasCompleteParcel, type ParcelFields } from "@/lib/listing-publish";
import { normalizePhoneForShippo } from "@/lib/shippo-label-contacts";

/** Launch default: domestic US ship-from only. */
export const SELLER_SHIP_FROM_COUNTRY = "US";
export const SELLER_SHIP_FROM_COUNTRY_LABEL = "United States";

export type SellerShipFromFields = {
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  defaultShipFromAddressId?: string | null;
  defaultShipFromAddress?: {
    line1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    phone?: string | null;
  } | null;
  /** Denormalized from default ship-from address for clients without the relation loaded. */
  shipFromPhone?: string | null;
};

export type SellerStripeFields = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
};

function hasSellerShipFromContactPhone(s: SellerShipFromFields): boolean {
  const phone = s.shipFromPhone ?? s.defaultShipFromAddress?.phone;
  return normalizePhoneForShippo(phone) !== null;
}

/** Shippo label purchase needs a complete origin address plus USPS contact phone. */
export function hasCompleteSellerShipFrom(s: SellerShipFromFields): boolean {
  let addressComplete = false;
  if (
    s.defaultShipFromAddressId &&
    s.defaultShipFromAddress?.line1?.trim() &&
    s.defaultShipFromAddress?.city?.trim() &&
    s.defaultShipFromAddress?.state?.trim() &&
    s.defaultShipFromAddress?.postalCode?.trim() &&
    s.defaultShipFromAddress?.country?.trim()
  ) {
    addressComplete = true;
  } else {
    addressComplete = Boolean(
      s.shipFromStreet?.trim() &&
        s.shipFromCity?.trim() &&
        s.shipFromState?.trim() &&
        s.shipFromZip?.trim() &&
        s.shipFromCountry?.trim(),
    );
  }
  return addressComplete && hasSellerShipFromContactPhone(s);
}

/** Unified ship-from gate: API readiness checks and/or persisted seller profile fields. */
export function sellerHasShipFromAddress(
  checks: { hasShipFromAddress?: boolean } | null | undefined,
  seller: SellerShipFromFields | null | undefined,
): boolean {
  return Boolean(checks?.hasShipFromAddress) || (seller ? hasCompleteSellerShipFrom(seller) : false);
}

export function hasStripeConnectReady(s: SellerStripeFields): boolean {
  return Boolean(s.stripeAccountId && s.stripeOnboardingComplete);
}

/** Buyer-safe region line (no street address). */
export function formatShipsFromRegion(state: string | null | undefined, country: string | null | undefined): string | null {
  const st = state?.trim();
  const c = country?.trim();
  if (!st && !c) return null;
  if (st && c) return `${st}, ${c}`;
  return st || c || null;
}

export type FulfillmentReadinessIssue = {
  code: "stripe" | "ship_from" | "parcel";
  severity: "error" | "warning";
  message: string;
};

/**
 * Seller-facing blockers for shipping after sale (and publish readiness for Stripe/parcel).
 */
export function getSellerFulfillmentReadinessIssues(args: {
  listingStatus: ListingStatus;
  parcel: ParcelFields;
  seller: SellerShipFromFields & SellerStripeFields;
}): FulfillmentReadinessIssue[] {
  const issues: FulfillmentReadinessIssue[] = [];
  const publishedOrSold =
    args.listingStatus === "active" ||
    args.listingStatus === "auction_live" ||
    args.listingStatus === "awaiting_auction_payment" ||
    args.listingStatus === "sold";

  if (!hasStripeConnectReady(args.seller)) {
    issues.push({
      code: "stripe",
      severity: publishedOrSold ? "error" : "warning",
      message:
        "Stripe Connect is not ready — complete onboarding under Account → Seller before publishing or receiving payouts.",
    });
  }

  if (!hasCompleteSellerShipFrom(args.seller)) {
    issues.push({
      code: "ship_from",
      severity: publishedOrSold ? "error" : "warning",
      message:
        "Ship-from setup is incomplete — add street, city, state, ZIP, country, and a contact phone under Account → Seller so USPS labels can print after payment.",
    });
  }

  if (!hasCompleteParcel(args.parcel)) {
    issues.push({
      code: "parcel",
      severity: publishedOrSold ? "error" : "warning",
      message: publishedOrSold
        ? "Parcel weight and dimensions are missing on this listing — edit the listing and add them before you can buy shipping labels."
        : "Add parcel weight (oz) and length, width, and height (inches) before publishing — required for shipping labels.",
    });
  }

  return issues;
}
