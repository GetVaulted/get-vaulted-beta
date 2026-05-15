import { describe, expect, it } from "vitest";
import {
  getAddAnotherPreservedValues,
  getFieldsHiddenInQuickListMode,
  getPresetFields,
  getQuickListDefaults,
  isAdvancedShippingVisible,
  isCreateActionDisabled,
  isSaveDraftDisabled,
} from "@/lib/create-listing-form";

describe("create listing form helpers", () => {
  it("fills raw card preset defaults", () => {
    expect(getPresetFields("raw_card")).toEqual({
      shippingCategory: "raw_card",
      shippingBaseWeightOz: "4",
      shippingIncrementalWeightOz: "1",
      parcelWeightOz: "4",
      parcelLengthIn: "6",
      parcelWidthIn: "4",
      parcelHeightIn: "1",
    });
  });

  it("fills slab preset defaults", () => {
    expect(getPresetFields("slab")).toEqual({
      shippingCategory: "slab",
      shippingBaseWeightOz: "8",
      shippingIncrementalWeightOz: "3",
      parcelWeightOz: "8",
      parcelLengthIn: "8",
      parcelWidthIn: "6",
      parcelHeightIn: "2",
    });
  });

  it("fills small collectible preset defaults", () => {
    expect(getPresetFields("small_collectible")).toEqual({
      shippingCategory: "small_collectible",
      shippingBaseWeightOz: "6",
      shippingIncrementalWeightOz: "2",
      parcelWeightOz: "6",
      parcelLengthIn: "8",
      parcelWidthIn: "6",
      parcelHeightIn: "4",
    });
  });

  it("keeps custom preset manually editable", () => {
    expect(getPresetFields("custom")).toBeNull();
  });

  it("disables create/publish when readiness fails", () => {
    expect(
      isCreateActionDisabled({
        hasReadinessIssues: true,
        submitting: false,
        draftSaving: false,
        hasValidationErrors: false,
      }),
    ).toBe(true);
  });

  it("does not disable based only on draft action state", () => {
    expect(
      isCreateActionDisabled({
        hasReadinessIssues: false,
        submitting: false,
        draftSaving: false,
        hasValidationErrors: false,
      }),
    ).toBe(false);
  });

  it("quick list mode hides non-critical fields", () => {
    expect(getFieldsHiddenInQuickListMode(true)).toEqual(["category", "condition", "description", "shippingAdvanced"]);
    expect(getFieldsHiddenInQuickListMode(false)).toEqual([]);
  });

  it("quick list applies defaults for repeat seller flow", () => {
    expect(getQuickListDefaults({})).toEqual({
      category: "Memorabilia",
      condition: "Unspecified",
      shippingPreset: "slab",
      handlingTime: "1–2 business days",
      format: "buy_now",
    });
    expect(
      getQuickListDefaults({
        category: "Trading Cards",
        condition: "PSA 10",
        format: "auction",
        shippingPreset: "raw_card",
      }),
    ).toEqual({
      category: "Trading Cards",
      condition: "PSA 10",
      shippingPreset: "raw_card",
      handlingTime: "1–2 business days",
      format: "auction",
    });
  });

  it("list and add another preserves expected fields", () => {
    expect(
      getAddAnotherPreservedValues({
        category: "Memorabilia",
        condition: "PSA 10",
        format: "auction",
        shippingPreset: "slab",
      }),
    ).toEqual({
      category: "Memorabilia",
      condition: "PSA 10",
      format: "auction",
      shippingPreset: "slab",
    });
  });

  it("advanced shipping stays collapsed in quick mode", () => {
    expect(isAdvancedShippingVisible({ quickListMode: true, expanded: true })).toBe(false);
    expect(isAdvancedShippingVisible({ quickListMode: false, expanded: false })).toBe(false);
    expect(isAdvancedShippingVisible({ quickListMode: false, expanded: true })).toBe(true);
  });

  it("save draft is allowed even when create might be blocked", () => {
    expect(isSaveDraftDisabled({ submitting: false, draftSaving: false })).toBe(false);
    expect(isSaveDraftDisabled({ submitting: true, draftSaving: false })).toBe(true);
  });
});
