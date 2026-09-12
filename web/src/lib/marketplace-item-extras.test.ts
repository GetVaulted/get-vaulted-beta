import { describe, expect, it } from "vitest";
import { buildItemPageExtras, NEW_SELLER_CREDIBILITY_LABEL } from "./marketplace-item-extras";
import type { MarketplaceListing } from "@/content/marketplace-listings";

// Legal/compliance audit (2026-07): "watching" count and seller sales credibility line were
// previously random numbers derived from a hash of the listing id / username (fake social proof
// and fake sales figures shown to buyers). They must now be either real numbers supplied by the
// caller, or an honest zero-state — never fabricated.

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

describe("buildItemPageExtras", () => {
  it("defaults watchingCount to 0 (never a fabricated number) when no real signal is supplied", () => {
    const extras = buildItemPageExtras(baseListing());
    expect(extras.watchingCount).toBe(0);
  });

  it("uses the real watching count when supplied", () => {
    const extras = buildItemPageExtras(baseListing(), { watchingCount: 7 });
    expect(extras.watchingCount).toBe(7);
  });

  it("defaults sellerCredibilityLabel to an honest new-seller label when no real signal is supplied", () => {
    const extras = buildItemPageExtras(baseListing());
    expect(extras.sellerCredibilityLabel).toBe(NEW_SELLER_CREDIBILITY_LABEL);
  });

  it("uses the real seller credibility label when supplied", () => {
    const extras = buildItemPageExtras(baseListing(), { sellerCredibilityLabel: "12 orders on Get Vaulted" });
    expect(extras.sellerCredibilityLabel).toBe("12 orders on Get Vaulted");
  });

  it("does not claim unconditional seller verification or insurance in the default description", () => {
    const extras = buildItemPageExtras(baseListing());
    expect(extras.description.toLowerCase()).not.toContain("verified get vaulted seller");
    expect(extras.description.toLowerCase()).not.toContain("insurance");
  });

  it("does not present $0 listing shipping as Buyer pays $0.00", () => {
    const extras = buildItemPageExtras(
      baseListing({ shippingPriceUsd: 0, handlingTimeLabel: "1–2 business days" }),
    );
    expect(extras.shippingSummary.toLowerCase()).not.toContain("buyer pays $0.00");
    expect(extras.estimatedShippingDisplay).toBe("Estimated at checkout");
  });

  it("explains trade label purchase instead of free buyer shipping", () => {
    const extras = buildItemPageExtras(
      baseListing({ tradeOnly: true, shippingPriceUsd: 0, handlingTimeLabel: "1–2 business days" }),
    );
    expect(extras.shippingSummary.toLowerCase()).toContain("each party buys their own");
    expect(extras.estimatedShippingDisplay.toLowerCase()).toContain("own label");
    expect(extras.shippingSummary).not.toMatch(/Buyer pays \$0\.00/i);
  });
});
