import { describe, expect, it } from "vitest";
import {
  defaultActiveSpotModeForPin,
  endVariantSpotAuctionNoBidsReset,
  idleVariantSpotCommerceReset,
  isVariantSpotAuctionArmed,
  isVariantSpotAuctionLive,
  isVariantSpotFixedCheckoutLive,
  shopAvailableSpotCount,
  shopAvailableVariants,
  shopVariantCountDuringSpotAuction,
} from "@/lib/live-variant-spot-commerce";

describe("live-variant-spot-commerce", () => {
  it("defaults hybrid/auction pins to auction-armed (not instant buy-now)", () => {
    expect(defaultActiveSpotModeForPin("hybrid")).toBe("auction");
    expect(defaultActiveSpotModeForPin("auction")).toBe("auction");
    expect(defaultActiveSpotModeForPin("fixed")).toBe("fixed");
  });

  it("excludes an auction-armed pinned team from fixed shop checkout", () => {
    const item = {
      salesFormat: "variant_selection",
      variantAssignmentMode: "pick",
      biddingOpen: false,
      activeSpotCommerceMode: "auction" as const,
      auctionVariantId: null,
      variants: [
        {
          id: "v1",
          label: "Chiefs",
          priceUsd: 1,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: "available",
        },
        {
          id: "v2",
          label: "Bills",
          priceUsd: 1,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: "available",
        },
      ],
    };
    expect(isVariantSpotAuctionArmed(item)).toBe(true);
    expect(shopAvailableVariants(item).map((v) => v.id)).toEqual(["v2"]);
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
        variants: [
          ...item.variants,
          {
            id: "v2",
            label: "Bills",
            priceUsd: 35,
            quantityRemaining: 1,
            soldCount: 0,
            isHot: false,
            status: "available",
          },
        ],
      }),
    ).toBe(true);
    expect(shopVariantCountDuringSpotAuction(item)).toBe(0);
    expect(
      shopVariantCountDuringSpotAuction({
        ...item,
        variants: [
          ...item.variants,
          {
            id: "v2",
            label: "Bills",
            priceUsd: 35,
            quantityRemaining: 1,
            soldCount: 0,
            isHot: false,
            status: "available",
          },
        ],
      }),
    ).toBe(1);
    expect(shopAvailableSpotCount(item)).toBe(0);
    expect(
      shopAvailableSpotCount({
        ...item,
        biddingOpen: false,
        activeSpotCommerceMode: "fixed",
        auctionVariantId: null,
        variants: item.variants,
      }),
    ).toBe(1);
    expect(
      shopAvailableSpotCount({
        ...item,
        variants: [
          ...item.variants,
          {
            id: "v2",
            label: "Bills",
            priceUsd: 35,
            quantityRemaining: 1,
            soldCount: 0,
            isHot: false,
            status: "available",
          },
        ],
      }),
    ).toBe(1);
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

  it("empty spot auction reset keeps pin armed (not buy-now)", () => {
    expect(endVariantSpotAuctionNoBidsReset()).toMatchObject({
      biddingOpen: false,
      activeSpotCommerceMode: "auction",
      currentBidUsd: null,
      lastHighBidderId: null,
    });
    expect(endVariantSpotAuctionNoBidsReset()).not.toHaveProperty("auctionVariantId");
  });
});
