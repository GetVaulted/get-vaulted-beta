import { describe, expect, it } from "vitest";
import { PLATFORM_SHIPPING_PROFILE_SEEDS, suggestShippingProfileSlugForCategory } from "@/lib/unified-shipping-engine";

describe("live show shipping profile inheritance", () => {
  it("includes all required default profile slugs from product spec", () => {
    const slugs = new Set(PLATFORM_SHIPPING_PROFILE_SEEDS.map((p) => p.slug));
    expect(slugs.has("trading_cards")).toBe(true);
    expect(slugs.has("graded_card")).toBe(true);
    expect(slugs.has("card_lot")).toBe(true);
    expect(slugs.has("jersey")).toBe(true);
    expect(slugs.has("mini_helmet")).toBe(true);
    expect(slugs.has("full_size_helmet")).toBe(true);
    expect(slugs.has("speedflex_helmet")).toBe(true);
    expect(slugs.has("sneakers")).toBe(true);
    expect(slugs.has("watch")).toBe(true);
    expect(slugs.has("funko_collectible")).toBe(true);
    expect(slugs.has("custom")).toBe(true);
  });

  it("marks helmets as separate-package profiles", () => {
    const full = PLATFORM_SHIPPING_PROFILE_SEEDS.find((p) => p.slug === "full_size_helmet");
    const speed = PLATFORM_SHIPPING_PROFILE_SEEDS.find((p) => p.slug === "speedflex_helmet");
    expect(full?.requiresSeparatePackage).toBe(true);
    expect(speed?.requiresSeparatePackage).toBe(true);
    expect(full?.bundleAllowed).toBe(false);
  });

  it("suggests helmet profile from memorabilia category", () => {
    expect(suggestShippingProfileSlugForCategory("Full Size Helmet Break")).toBe("full_size_helmet");
    expect(suggestShippingProfileSlugForCategory("Trading Cards")).toBe("trading_cards");
  });

  it("maps card breaks to the light mailer band (not card_lot)", () => {
    expect(suggestShippingProfileSlugForCategory("Live Break")).toBe("trading_cards");
    expect(suggestShippingProfileSlugForCategory("NFL Break")).toBe("trading_cards");
    expect(suggestShippingProfileSlugForCategory("Card Lot")).toBe("card_lot");
    expect(suggestShippingProfileSlugForCategory("Random Lot")).toBe("card_lot");
  });
});
