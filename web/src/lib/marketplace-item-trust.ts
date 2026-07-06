import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";

export type ItemTrustMetrics = {
  sellerLevel: string | null;
  completedSales: string;
  accountStanding: string;
  authenticationStatus: string;
};

function parseSalesCount(credibilityLabel: string): number | null {
  const m = credibilityLabel.match(/([\d,]+)\s+(?:orders|sales)/i);
  if (!m) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function buildItemTrustMetrics(
  listing: MarketplaceListing,
  extras: ItemPageExtras,
): ItemTrustMetrics {
  const sales = parseSalesCount(extras.sellerCredibilityLabel);
  const salesLabel = sales != null ? sales.toLocaleString("en-US") : "New";

  const accountStanding =
    listing.sellerLevel === "elite_vault_verified" || listing.sellerLevel === "vault_verified"
      ? "Excellent"
      : listing.sellerLevel === "trusted_seller"
        ? "Very good"
        : sales != null && sales >= 250
          ? "Excellent"
          : sales != null && sales >= 50
            ? "Good"
            : "Established";

  // "Vault verified" is a claim of platform authentication, so it must reflect the seller's real,
  // backend-computed trust tier — never the seller-settable `vaultPick` editorial/featured flag
  // (legal/compliance audit 2026-07).
  const isVerifiedSellerLevel = listing.sellerLevel === "vault_verified" || listing.sellerLevel === "elite_vault_verified";
  const authenticationStatus = extras.authenticationLabel
    ? "On file"
    : listing.condition.match(/^(PSA|BGS|SGC)/i)
      ? "Graded item"
      : isVerifiedSellerLevel
        ? "Vault verified"
        : "Ask seller";

  return {
    sellerLevel: listing.sellerLevelLabel ?? null,
    completedSales: salesLabel,
    accountStanding,
    authenticationStatus,
  };
}
