import { describe, expect, it } from "vitest";
import {
  defaultActiveSpotModeForPin,
  idleVariantSpotCommerceReset,
  isVariantSpotAuctionLive,
  isVariantSpotFixedCheckoutLive,
} from "@/lib/live-variant-spot-commerce";

describe("live-variant-spot-commerce", () => {
  it("defaults hybrid pins to fixed checkout", () => {
    expect(defaultActiveSpotModeForPin("hybrid")).toBe("fixed");
    expect(defaultActiveSpotModeForPin("auction")).toBe("auction");
  });

  it("detects live spot auction vs fixed checkout", () => {
    const item = {
      salesFormat: "variant_selection",
      variantAssignmentMode: "pick",
      biddingOpen: true,
      activeSpotCommerceMode: "auction" as const,
      auctionVariantId: "v1",
      variants: [
        {
          id: "v1",
          label: "Chiefs",
          priceUsd: 40,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: "available",
        },
      ],
    };
    expect(isVariantSpotAuctionLive(item)).toBe(true);
    expect(isVariantSpotFixedCheckoutLive(item)).toBe(false);
    expect(
      isVariantSpotFixedCheckoutLive({
        ...item,
        biddingOpen: false,
        activeSpotCommerceMode: "fixed",
        auctionVariantId: null,
      }),
    ).toBe(true);
    expect(
      isVariantSpotFixedCheckoutLive({
        salesFormat: "variant_selection",
        variantAssignmentMode: "pick",
        biddingOpen: false,
        variants: [
          {
            id: "v1",
            label: "Chiefs",
            priceUsd: 40,
            quantityRemaining: 1,
            soldCount: 0,
            isHot: false,
            status: "available",
          },
        ],
      }),
    ).toBe(true);
  });

  it("pin switch reset clears auction fields", () => {
    expect(idleVariantSpotCommerceReset()).toMatchObject({
      biddingOpen: false,
      auctionVariantId: null,
      activeSpotCommerceMode: "fixed",
    });
  });
});
