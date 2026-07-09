import { describe, expect, it } from "vitest";
import {
  GRADED_SLAB_PARCEL,
  isInflatedCardParcel,
  isInflatedSmallCollectibleParcel,
  resolveMarketplaceQuoteParcel,
  SMALL_COLLECTIBLE_PARCEL,
} from "./marketplace-parcel-defaults";

describe("marketplace-parcel-defaults", () => {
  it("uses tight slab envelope instead of legacy oversized parcel", () => {
    const parcel = resolveMarketplaceQuoteParcel({
      shippingCategory: "slab",
      parcelWeightOz: 8,
      parcelLengthIn: 8,
      parcelWidthIn: 6,
      parcelHeightIn: 2,
    });
    expect(parcel.weight).toBe(String(GRADED_SLAB_PARCEL.parcelWeightOz));
    expect(parcel.length).toBe(String(GRADED_SLAB_PARCEL.parcelLengthIn));
    expect(parcel.width).toBe(String(GRADED_SLAB_PARCEL.parcelWidthIn));
    expect(parcel.height).toBe(String(GRADED_SLAB_PARCEL.parcelHeightIn));
  });

  it("keeps reasonable custom slab dimensions", () => {
    const parcel = resolveMarketplaceQuoteParcel({
      shippingCategory: "slab",
      parcelWeightOz: 5,
      parcelLengthIn: 7,
      parcelWidthIn: 5,
      parcelHeightIn: 1,
    });
    expect(parcel.weight).toBe("5");
    expect(isInflatedCardParcel({
      parcelWeightOz: 5,
      parcelLengthIn: 7,
      parcelWidthIn: 5,
      parcelHeightIn: 1,
    })).toBe(false);
  });

  it("uses tight small-collectible envelope instead of legacy medium-box parcel", () => {
    const parcel = resolveMarketplaceQuoteParcel({
      shippingCategory: "small_collectible",
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 6,
    });
    expect(parcel.weight).toBe(String(SMALL_COLLECTIBLE_PARCEL.parcelWeightOz));
    expect(parcel.length).toBe(String(SMALL_COLLECTIBLE_PARCEL.parcelLengthIn));
    expect(isInflatedSmallCollectibleParcel({
      parcelWeightOz: 16,
      parcelLengthIn: 10,
      parcelWidthIn: 8,
      parcelHeightIn: 6,
    })).toBe(true);
  });
});
