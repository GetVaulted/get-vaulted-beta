import { describe, expect, it } from "vitest";
import {
  allVariantSpotsSold,
  buildVariantsFromPreset,
  isVariantPurchaseItem,
  isVariantSalesFormat,
  normalizeVariantDrafts,
  NFL_DIVISIONS_PRESET,
  summarizeVariantSpots,
  variantBuyerSelectLabel,
  variantClaimPrimaryLabel,
} from "@/lib/live-item-variant-presets";

describe("live-item-variant-presets", () => {
  it("NFL divisions preset has 8 divisions", () => {
    expect(NFL_DIVISIONS_PRESET).toHaveLength(8);
    expect(NFL_DIVISIONS_PRESET.map((d) => d.label)).toContain("NFC North");
  });

  it("buildVariantsFromPreset applies default price", () => {
    const rows = buildVariantsFromPreset("nfl_divisions", 23.99, 1);
    expect(rows).toHaveLength(8);
    expect(rows[0]?.priceUsd).toBe(23.99);
    expect(rows[0]?.quantityInitial).toBe(1);
  });

  it("normalizeVariantDrafts filters invalid rows", () => {
    const rows = normalizeVariantDrafts([
      { label: "  AFC West  ", priceUsd: 10, quantityInitial: 2, isHot: true },
      { label: "", priceUsd: 5 },
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("AFC West");
    expect(rows[0]?.isHot).toBe(true);
  });

  it("isVariantSalesFormat covers team break, variant selection, and player selection", () => {
    expect(isVariantSalesFormat("team_break")).toBe(true);
    expect(isVariantSalesFormat("variant_selection")).toBe(true);
    expect(isVariantSalesFormat("player_selection")).toBe(true);
    expect(isVariantSalesFormat("auction")).toBe(false);
  });

  it("summarizeVariantSpots counts open and sold spots", () => {
    const summary = summarizeVariantSpots([
      { soldCount: 1, quantityRemaining: 0, status: "sold_out", priceUsd: 35 },
      { soldCount: 0, quantityRemaining: 2, status: "available", priceUsd: 30 },
      { soldCount: 0, quantityRemaining: 1, status: "available", priceUsd: 40 },
    ]);
    expect(summary.sold).toBe(1);
    expect(summary.available).toBe(3);
    expect(summary.fromPriceUsd).toBe(30);
  });

  it("isVariantPurchaseItem requires variants", () => {
    expect(isVariantPurchaseItem({ salesFormat: "team_break", variants: [{ id: "1" }] })).toBe(true);
    expect(isVariantPurchaseItem({ salesFormat: "team_break", variants: [] })).toBe(false);
    expect(isVariantPurchaseItem({ salesFormat: "auction", variants: [{ id: "1" }] })).toBe(false);
  });

  it("allVariantSpotsSold is true when every row is sold out", () => {
    expect(
      allVariantSpotsSold([
        { soldCount: 1, quantityRemaining: 0, status: "sold_out", priceUsd: 35 },
        { soldCount: 1, quantityRemaining: 0, status: "sold_out", priceUsd: 35 },
      ]),
    ).toBe(true);
    expect(
      allVariantSpotsSold([{ soldCount: 0, quantityRemaining: 1, status: "available", priceUsd: 30 }]),
    ).toBe(false);
  });

  it("variantBuyerSelectLabel uses division wording for team breaks", () => {
    expect(variantBuyerSelectLabel("team_break")).toBe("Pick Your Division");
    expect(variantBuyerSelectLabel("variant_selection")).toBe("Pick Your Team");
    expect(variantBuyerSelectLabel("player_selection")).toBe("Pick Your Player");
    expect(variantBuyerSelectLabel("player_selection", true)).toBe("Random Player");
  });

  it("variantClaimPrimaryLabel uses claim wording for pinned breaks", () => {
    expect(variantClaimPrimaryLabel("team_break")).toBe("Claim Division");
    expect(variantClaimPrimaryLabel("variant_selection")).toBe("Claim Team");
  });
});
