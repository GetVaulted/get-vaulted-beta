import { describe, expect, it } from "vitest";
import { physicalListingWeightOz } from "@/services/shipping/bundled-labels";

const baseListing = {
  id: "l1",
  title: "Card",
  shipAlone: false,
  parcelLengthIn: null as number | null,
  parcelWidthIn: null as number | null,
  parcelHeightIn: null as number | null,
};

describe("physicalListingWeightOz", () => {
  it("uses parcelWeightOz when set and positive", () => {
    expect(
      physicalListingWeightOz({
        ...baseListing,
        parcelWeightOz: 14,
        shippingBaseWeightOz: 4,
      }),
    ).toBe(14);
  });

  it("falls back to shippingBaseWeightOz when parcel unset", () => {
    expect(
      physicalListingWeightOz({
        ...baseListing,
        parcelWeightOz: null,
        shippingBaseWeightOz: 6,
      }),
    ).toBe(6);
  });

  it("uses at least 1 oz", () => {
    expect(
      physicalListingWeightOz({
        ...baseListing,
        parcelWeightOz: 0,
        shippingBaseWeightOz: 0,
      }),
    ).toBe(1);
  });
});
