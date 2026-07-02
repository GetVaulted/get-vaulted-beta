import { describe, expect, it } from "vitest";
import {
  resolveLiveHostDefaultShippingProfileId,
  resolveSellerShippingProfileIdForCategory,
  suggestSellerShippingProfileSourceSlugForCategory,
} from "./live-show-category-shipping-profile";

const PROFILES = [
  { id: "cards-id", sourceSlug: "live_break_spot", isDefault: true },
  { id: "helmet-id", sourceSlug: "full_size_helmet" },
  { id: "mini-id", sourceSlug: "mini_helmet" },
] as const;

describe("suggestSellerShippingProfileSourceSlugForCategory", () => {
  it("maps Cards to card mailer profile", () => {
    expect(suggestSellerShippingProfileSourceSlugForCategory("Cards")).toBe("live_break_spot");
  });

  it("maps Helmets to full-size helmet profile", () => {
    expect(suggestSellerShippingProfileSourceSlugForCategory("Helmets")).toBe("full_size_helmet");
  });
});

describe("resolveSellerShippingProfileIdForCategory", () => {
  it("picks card profile id for Cards category", () => {
    expect(resolveSellerShippingProfileIdForCategory(PROFILES, "Cards")).toBe("cards-id");
  });

  it("picks helmet profile id for Helmets category", () => {
    expect(resolveSellerShippingProfileIdForCategory(PROFILES, "Helmets")).toBe("helmet-id");
  });
});

describe("resolveLiveHostDefaultShippingProfileId", () => {
  it("prefers show default over category-mapped break spot profile", () => {
    expect(
      resolveLiveHostDefaultShippingProfileId({
        profiles: [
          ...PROFILES,
          { id: "graded-id", sourceSlug: "graded_card" },
        ],
        roomDefaultSellerShippingProfileId: "graded-id",
        category: "Cards",
      }),
    ).toBe("graded-id");
  });

  it("falls back to category when show has no default", () => {
    expect(
      resolveLiveHostDefaultShippingProfileId({
        profiles: PROFILES,
        roomDefaultSellerShippingProfileId: null,
        category: "Cards",
      }),
    ).toBe("cards-id");
  });
});
