import type { LayawayPlanType, Listing, ListingStatus } from "@/generated/prisma/client";
import { LAYAWAY_MIN_LISTING_PRICE_USD } from "@/lib/layaway/constants";
import { prisma } from "@/lib/prisma";

export function sellerMayEnableLayaway(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd >= LAYAWAY_MIN_LISTING_PRICE_USD;
}

/** Auto-disable layaway when price drops below platform minimum. */
export function resolveAllowLayawayForListing(args: {
  allowLayaway?: boolean;
  priceUsd: number;
}): boolean {
  if (!args.allowLayaway) return false;
  return sellerMayEnableLayaway(args.priceUsd);
}

export function listingSupportsLayawayCheckout(listing: {
  buyingFormat: string;
  status: ListingStatus;
  allowLayaway: boolean;
  priceUsd: number;
  moderationRemovedAt: Date | null;
}): boolean {
  if (listing.buyingFormat !== "buy_now") return false;
  if (listing.status !== "active") return false;
  if (listing.moderationRemovedAt) return false;
  if (!listing.allowLayaway) return false;
  return sellerMayEnableLayaway(listing.priceUsd);
}

export function listingLockedByLayaway(status: ListingStatus): boolean {
  return status === "layaway_reserved";
}

export async function buyerHasActiveLayaway(buyerId: string): Promise<boolean> {
  const n = await prisma.layaway.count({
    where: { buyerId, status: "active" },
  });
  return n > 0;
}

export function isValidLayawayPlan(plan: string): plan is LayawayPlanType {
  return plan === "thirty_day" || plan === "sixty_day";
}
