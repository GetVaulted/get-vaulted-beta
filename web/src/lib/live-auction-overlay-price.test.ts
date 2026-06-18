import { describe, expect, it } from "vitest";
import {
  liveAuctionDisplayBidUsd,
  liveAuctionOpeningBidUsd,
  resolveLiveItemOverlayPrice,
  resolvePinnedLotOverlayPrice,
} from "@/lib/live-auction-overlay-price";

describe("live-auction-overlay-price", () => {
  it("defaults opening bid to $1 when start and price are blank", () => {
    expect(liveAuctionOpeningBidUsd({})).toBe(1);
    expect(
      resolveLiveItemOverlayPrice({ commerceMode: "auction" }).label,
    ).toBe("Opening bid");
    expect(
      resolveLiveItemOverlayPrice({ commerceMode: "auction" }).amountUsd,
    ).toBe(1);
  });

  it("uses starting bid over optional price for auction overlays", () => {
    expect(
      resolveLiveItemOverlayPrice({
        commerceMode: "auction",
        startingBidUsd: 5,
        priceUsd: 32,
        currentBidUsd: 32,
      }).label,
    ).toBe("Opening bid");
    expect(
      resolveLiveItemOverlayPrice({
        commerceMode: "auction",
        startingBidUsd: 1,
        priceUsd: 32,
        currentBidUsd: 32,
      }).amountUsd,
    ).toBe(1);
  });

  it("shows current bid after an accepted bid exists", () => {
    expect(
      resolveLiveItemOverlayPrice({
        commerceMode: "auction",
        startingBidUsd: 1,
        priceUsd: 32,
        currentBidUsd: 12,
        lastHighBidderId: "u1",
      }),
    ).toMatchObject({ kind: "current", label: "Current bid", amountUsd: 12 });
  });

  it("uses asking for buy now items", () => {
    expect(
      resolveLiveItemOverlayPrice({
        commerceMode: "buy_now",
        priceUsd: 32,
        startingBidUsd: 1,
      }),
    ).toMatchObject({ kind: "asking", label: "Asking", amountUsd: 32 });
  });

  it("uses priceUsd when starting bid is unset (PYT/PYD spot boards)", () => {
    expect(liveAuctionOpeningBidUsd({ priceUsd: 35 })).toBe(35);
    expect(
      resolveLiveItemOverlayPrice({
        commerceMode: "auction",
        priceUsd: 35,
      }).amountUsd,
    ).toBe(35);
  });

  it("resolvePinnedLotOverlayPrice shows From for variant spot boards", () => {
    expect(
      resolvePinnedLotOverlayPrice({
        salesFormat: "variant_selection",
        variants: [
          { priceUsd: 35, quantityRemaining: 1, status: "available" },
          { priceUsd: 40, quantityRemaining: 1, status: "available" },
        ],
      }),
    ).toMatchObject({ kind: "asking", label: "From", amountUsd: 35 });
  });

  it("display bid ignores priceUsd without accepted bid", () => {
    expect(
      liveAuctionDisplayBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 32,
      }),
    ).toBe(1);
    expect(
      liveAuctionDisplayBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 12,
        lastHighBidderId: "u1",
      }),
    ).toBe(12);
  });
});
