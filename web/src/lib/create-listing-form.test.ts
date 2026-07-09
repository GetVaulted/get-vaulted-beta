import { describe, expect, it } from "vitest";
import {
  getAddAnotherPreservedValues,
  getFieldsHiddenInQuickListMode,
  getPresetFields,
  getQuickListDefaults,
  isAdvancedShippingVisible,
  isCreateActionDisabled,
  isSaveDraftDisabled,
  MAX_LISTING_PRICE_USD,
  moneyFieldErrorMessage,
  parseMoney,
  parseNonNegativeMoney,
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
      shippingBaseWeightOz: "5",
      shippingIncrementalWeightOz: "2",
      parcelWeightOz: "5",
      parcelLengthIn: "7",
      parcelWidthIn: "5",
      parcelHeightIn: "1",
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
      parcelHeightIn: "3",
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

describe("parseMoney", () => {
  it("accepts plain positive amounts", () => {
    expect(parseMoney("12.50")).toBe(12.5);
    expect(parseMoney("1")).toBe(1);
    expect(parseMoney("  20  ")).toBe(20);
  });

  it("rejects negative input instead of silently flipping it positive", () => {
    expect(parseMoney("-100")).toBeNull();
    expect(parseMoney("-0.01")).toBeNull();
  });

  it("rejects non-numeric input instead of silently stripping it to a number", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("12abc")).toBeNull();
    expect(parseMoney("$12.50")).toBeNull();
  });

  it("rejects zero and blank input", () => {
    expect(parseMoney("0")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
  });

  it("rejects more than two decimal places", () => {
    expect(parseMoney("12.999")).toBeNull();
  });

  it("rejects amounts above the marketplace price ceiling", () => {
    expect(parseMoney(String(MAX_LISTING_PRICE_USD))).toBe(MAX_LISTING_PRICE_USD);
    expect(parseMoney("1000000")).toBeNull();
    expect(parseMoney("1000000.00")).toBeNull();
  });

  it("rejects scientific notation", () => {
    expect(parseMoney("1e10")).toBeNull();
    expect(parseMoney("1E10")).toBeNull();
  });
});

describe("parseNonNegativeMoney", () => {
  it("accepts zero", () => {
    expect(parseNonNegativeMoney("0")).toBe(0);
  });

  it("rejects negative input instead of silently flipping it positive", () => {
    expect(parseNonNegativeMoney("-5")).toBeNull();
  });

  it("rejects non-numeric input instead of silently stripping it to a number", () => {
    expect(parseNonNegativeMoney("abc")).toBeNull();
    expect(parseNonNegativeMoney("12abc")).toBeNull();
  });

  it("rejects amounts above the marketplace price ceiling", () => {
    expect(parseNonNegativeMoney("1000000")).toBeNull();
  });
});

describe("moneyFieldErrorMessage", () => {
  it("calls out negative amounts specifically", () => {
    expect(moneyFieldErrorMessage("-100", { label: "Price", allowZero: false })).toMatch(/negative/i);
  });

  it("calls out non-numeric amounts specifically", () => {
    expect(moneyFieldErrorMessage("abc", { label: "Price", allowZero: false })).toMatch(/digits only/i);
  });

  it("calls out amounts above the ceiling specifically", () => {
    expect(moneyFieldErrorMessage("5000000", { label: "Price", allowZero: false })).toMatch(/exceed/i);
  });

  it("calls out zero for fields that require a positive amount", () => {
    expect(moneyFieldErrorMessage("0", { label: "Price", allowZero: false })).toMatch(/greater than \$0/i);
  });
});
