import { describe, expect, it } from "vitest";
import {
  absoluteCanonicalUrl,
  buildListingProductJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/site-seo";

describe("site-seo", () => {
  it("builds absolute canonical URLs on the production host", () => {
    expect(absoluteCanonicalUrl("/marketplace")).toBe("https://shopgetvaulted.com/marketplace");
  });

  it("builds Product JSON-LD for listings", () => {
    const json = buildListingProductJsonLd({
      listingId: "listing_1",
      title: "PSA 10 Charizard",
      condition: "Graded",
      buyingFormat: "buy_now",
      priceUsd: 499.99,
      sellerUsername: "getvaulted",
      status: "active",
      imageUrl: "https://cdn.example.com/card.jpg",
    });
    expect(json["@type"]).toBe("Product");
    expect(json.name).toBe("PSA 10 Charizard");
    expect((json.offers as { price: string }).price).toBe("499.99");
  });

  it("builds WebSite JSON-LD with search action", () => {
    const json = buildWebSiteJsonLd();
    expect(json["@type"]).toBe("WebSite");
    expect((json.potentialAction as { "@type": string })["@type"]).toBe("SearchAction");
  });
});
