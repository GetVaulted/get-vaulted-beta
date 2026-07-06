import { describe, expect, it } from "vitest";
import { buildItemTrustMetrics } from "./marketplace-item-trust";
import { buildItemPageExtras } from "./marketplace-item-extras";
import type { MarketplaceListing } from "@/content/marketplace-listings";

// Legal/compliance audit (2026-07): the seller trust panel on every listing page previously showed
// a "Response time" and "Ship on time %" that were random numbers derived from a hash of the
// seller's username — not real data — presented to buyers as if they were genuine performance
// metrics. It also labeled any listing with the seller-settable `vaultPick` flag as "Vault
// verified" authentication. Both were deceptive; this locks in the fix.

function baseListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: "listing_1",
    title: "1986 Fleer Michael Jordan",
    price: 500,
    imageSeed: "seed",
    sellerUsername: "cardking",
    sellerVerified: false,
    category: "Trading Cards",
    buyingFormat: "buy_now",
    condition: "Near Mint",
    listedAt: new Date().toISOString(),
    href: "/listing/listing_1",
    ...overrides,
  };
}

describe("buildItemTrustMetrics", () => {
  it("no longer exposes a fabricated response time or ship performance stat", () => {
    const listing = baseListing();
    const extras = buildItemPageExtras(listing);
    const metrics = buildItemTrustMetrics(listing, extras) as Record<string, unknown>;

    expect(metrics.responseTime).toBeUndefined();
    expect(metrics.shipPerformance).toBeUndefined();
  });

  it('does not mark a listing "Vault verified" just because the seller set vaultPick', () => {
    const listing = baseListing({ vaultPick: true, sellerLevel: undefined });
    const extras = buildItemPageExtras(listing);

    const metrics = buildItemTrustMetrics(listing, extras);

    expect(metrics.authenticationStatus).not.toBe("Vault verified");
  });

  it('marks a listing "Vault verified" only when the seller has the real vault_verified tier', () => {
    const listing = baseListing({ vaultPick: false, sellerLevel: "vault_verified" });
    const extras = buildItemPageExtras(listing);

    const metrics = buildItemTrustMetrics(listing, extras);

    expect(metrics.authenticationStatus).toBe("Vault verified");
  });

  it('honestly reports "New" completed sales instead of a fabricated sales count', () => {
    const listing = baseListing();
    const extras = buildItemPageExtras(listing); // no realSignals supplied -> honest zero-state

    const metrics = buildItemTrustMetrics(listing, extras);

    expect(metrics.completedSales).toBe("New");
  });

  it("reports a real completed-sales count when supplied by the caller", () => {
    const listing = baseListing();
    const extras = buildItemPageExtras(listing, { sellerCredibilityLabel: "42 orders on Get Vaulted" });

    const metrics = buildItemTrustMetrics(listing, extras);

    expect(metrics.completedSales).toBe("42");
  });
});
