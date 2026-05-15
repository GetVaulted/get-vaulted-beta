import { describe, expect, it } from "vitest";
import { hasCompleteParcel } from "@/lib/listing-publish";

describe("hasCompleteParcel", () => {
  it("returns false when any dimension missing", () => {
    expect(
      hasCompleteParcel({
        parcelWeightOz: 16,
        parcelLengthIn: 10,
        parcelWidthIn: 8,
        parcelHeightIn: null,
      }),
    ).toBe(false);
  });

  it("returns false for non-positive weight", () => {
    expect(
      hasCompleteParcel({
        parcelWeightOz: 0,
        parcelLengthIn: 10,
        parcelWidthIn: 8,
        parcelHeightIn: 4,
      }),
    ).toBe(false);
  });

  it("returns true when all positive numbers", () => {
    expect(
      hasCompleteParcel({
        parcelWeightOz: 16,
        parcelLengthIn: 10,
        parcelWidthIn: 8,
        parcelHeightIn: 4,
      }),
    ).toBe(true);
  });
});
