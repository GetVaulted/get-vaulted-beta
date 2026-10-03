import { describe, expect, it } from "vitest";
import {
  isListingEligibleForShopPicker,
  isListingPullableIntoLiveQueue,
  resolveListingBackedQueueFields,
  salesFormatFromListingBuyingFormat,
} from "@/lib/live-room-shop-inventory";

const baseListing = {
  id: "lst_1",
  sellerId: "seller_1",
  title: "PSA 10 Chase",
  description: "Nice card\n<!--gv-inventory:live_show-->",
  buyingFormat: "auction" as const,
  status: "draft" as const,
  priceUsd: 25,
  startingBidUsd: 5,
  workspaceKey: null as string | null,
  moderationRemovedAt: null as Date | null,
  platformShippingProfileId: "psp_1",
  images: [{ url: "https://cdn.example.com/a.jpg", sortOrder: 0 }],
};

describe("live-room-shop-inventory", () => {
  it("treats live_show drafts as shop-eligible", () => {
    expect(isListingEligibleForShopPicker(baseListing)).toBe(true);
  });

  it("includes published marketplace buy-now", () => {
    expect(
      isListingEligibleForShopPicker({
        ...baseListing,
        buyingFormat: "buy_now",
        status: "active",
        description: "Shop item\n<!--gv-inventory:marketplace-->",
      }),
    ).toBe(true);
  });

  it("excludes workspace autosave and sold rows", () => {
    expect(isListingPullableIntoLiveQueue({ ...baseListing, workspaceKey: "create" })).toBe(false);
    expect(isListingPullableIntoLiveQueue({ ...baseListing, status: "sold" })).toBe(false);
  });

  it("maps buying format to sales format", () => {
    expect(salesFormatFromListingBuyingFormat("auction")).toBe("auction");
    expect(salesFormatFromListingBuyingFormat("buy_now")).toBe("buy_now");
  });

  it("fills queue fields from listing when body omits them", () => {
    const resolved = resolveListingBackedQueueFields({ listing: baseListing });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.fields.title).toBe("PSA 10 Chase");
    expect(resolved.fields.imageUrl).toContain("cdn.example.com");
    expect(resolved.fields.salesFormat).toBe("auction");
    expect(resolved.fields.startingBidUsd).toBe(5);
    expect(resolved.fields.shippingProfileId).toBe("psp_1");
  });

  it("rejects listings without photos", () => {
    const resolved = resolveListingBackedQueueFields({
      listing: { ...baseListing, images: [] },
    });
    expect(resolved.ok).toBe(false);
  });
});
