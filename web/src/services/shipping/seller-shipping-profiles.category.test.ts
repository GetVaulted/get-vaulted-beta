import { describe, expect, it } from "vitest";
import { suggestSellerShippingProfileSourceSlugForCategory } from "@/lib/live-show-category-shipping-profile";
import { suggestShippingProfileSlugForCategory } from "@/lib/unified-shipping-engine";

describe("live show shipping category bands", () => {
  it("Cards / card breaks use light mailer rates under the $9.99 cap", () => {
    expect(suggestSellerShippingProfileSourceSlugForCategory("Cards")).toBe("live_break_spot");
    expect(suggestShippingProfileSlugForCategory("Live Break")).toBe("trading_cards");
  });

  it("Helmets use full-size helmet rates (typically the $9.99 cap)", () => {
    expect(suggestSellerShippingProfileSourceSlugForCategory("Helmets")).toBe("full_size_helmet");
    expect(suggestShippingProfileSlugForCategory("Helmets")).toBe("full_size_helmet");
    expect(suggestShippingProfileSlugForCategory("Full Size Helmet Break")).toBe("full_size_helmet");
  });
});
