import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";

export type ItemTrustMetrics = {
  sellerLevel: string | null;
  completedSales: string;
  accountStanding: string;
  responseTime: string;
  shipPerformance: string;
  authenticationStatus: string;
};

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h + input.charCodeAt(i) * 17) % 9000;
  return h;
}

function parseSalesCount(credibilityLabel: string): number | null {
  const m = credibilityLabel.match(/([\d,]+)\s+sales/i);
  if (!m) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function buildItemTrustMetrics(
  listing: MarketplaceListing,
  extras: ItemPageExtras,
): ItemTrustMetrics {
  const seed = hashSeed(listing.sellerUsername);
  const sales = parseSalesCount(extras.sellerCredibilityLabel);
  const salesLabel =
    sales != null ? sales.toLocaleString("en-US") : extras.sellerCredibilityLabel.replace(/ sales/i, "") || "—";

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

  const responseHours = 1 + (seed % 4);
  const responseTime = responseHours <= 2 ? `< ${responseHours} hr` : `< ${responseHours} hrs`;

  const shipPct = 96 + (seed % 4);
  const shipPerformance = `${shipPct}% on time`;

  const authenticationStatus = extras.authenticationLabel
    ? "On file"
    : listing.condition.match(/^(PSA|BGS|SGC)/i)
      ? "Graded item"
      : listing.vaultPick
        ? "Vault verified"
        : "Ask seller";

  return {
    sellerLevel: listing.sellerLevelLabel ?? null,
    completedSales: salesLabel,
    accountStanding,
    responseTime,
    shipPerformance,
    authenticationStatus,
  };
}
