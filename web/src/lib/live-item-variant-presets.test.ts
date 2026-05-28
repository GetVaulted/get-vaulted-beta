import { describe, expect, it } from "vitest";
import { buildVariantsFromPreset, normalizeVariantDrafts, NFL_DIVISIONS_PRESET } from "@/lib/live-item-variant-presets";

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
});
