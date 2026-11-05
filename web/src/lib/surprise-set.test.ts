import { describe, expect, it } from "vitest";
import {
  SURPRISE_SET_MAX_UNITS,
  computeSurpriseSetOdds,
  expandSurpriseSetLabels,
  findProhibitedSurpriseWording,
  surpriseSetItemNameFromLabel,
  surpriseSetWeightOzForLabel,
  validateSurpriseSetItems,
  validateSurpriseSetMaxLabelWeightOz,
} from "../../../shared/surprise-set";

const goodItems = [
  { name: "Charizard ex", quantity: 3, msrpUsd: 40 },
  { name: "Pikachu promo", quantity: 17, msrpUsd: 8 },
];

describe("validateSurpriseSetItems", () => {
  it("accepts a valid set and reports the top-item odds", () => {
    const r = validateSurpriseSetItems(goodItems, "Pokemon surprise set");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalUnits).toBe(20);
      expect(r.topItemOdds).toBeCloseTo(0.15);
    }
  });

  it("allows a TikTok-style 1-of-500 chase item", () => {
    const r = validateSurpriseSetItems(
      [
        { name: "Chase card", quantity: 1, msrpUsd: 200 },
        { name: "Common pack", quantity: 499, msrpUsd: 5 },
      ],
      "Set",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalUnits).toBe(500);
      expect(r.topItemOdds).toBeCloseTo(0.002);
    }
  });

  it("allows exactly 500 units and labels every one uniquely", () => {
    const items = [
      { name: "Chase", quantity: 2, msrpUsd: 100 },
      { name: "Pack A", quantity: 249, msrpUsd: 8 },
      { name: "Pack B", quantity: 249, msrpUsd: 8 },
    ];
    expect(SURPRISE_SET_MAX_UNITS).toBe(500);
    const r = validateSurpriseSetItems(items);
    expect(r.ok).toBe(true);
    const labels = expandSurpriseSetLabels(items);
    expect(labels).toHaveLength(500);
    expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(500);
  });

  it("needs at least two different items", () => {
    const r = validateSurpriseSetItems([{ name: "Same", quantity: 10, msrpUsd: 5 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects more than the unit cap", () => {
    const r = validateSurpriseSetItems([
      { name: "A", quantity: SURPRISE_SET_MAX_UNITS, msrpUsd: 10 },
      { name: "B", quantity: 1, msrpUsd: 10 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects missing or non-positive MSRP and bad quantities", () => {
    expect(validateSurpriseSetItems([{ name: "A", quantity: 2, msrpUsd: 0 }, { name: "B", quantity: 2, msrpUsd: 5 }]).ok).toBe(false);
    expect(validateSurpriseSetItems([{ name: "A", quantity: 0, msrpUsd: 5 }, { name: "B", quantity: 2, msrpUsd: 5 }]).ok).toBe(false);
  });

  it("rejects the same name at two different prices", () => {
    const r = validateSurpriseSetItems([
      { name: "A", quantity: 2, msrpUsd: 5 },
      { name: "a", quantity: 2, msrpUsd: 9 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects value-promise wording in the title or item names", () => {
    expect(validateSurpriseSetItems(goodItems, "JACKPOT set").ok).toBe(false);
    expect(findProhibitedSurpriseWording("worth up to $500")).toBe("worth up to");
    expect(findProhibitedSurpriseWording("Mystery Pokemon set")).toBeNull();
  });
});

describe("price floor", () => {
  it("allows a unit price at or below the lowest retail price", () => {
    expect(validateSurpriseSetItems(goodItems, "Set", 8).ok).toBe(true);
    expect(validateSurpriseSetItems(goodItems, "Set", 5.5).ok).toBe(true);
  });

  it("rejects a unit price above the lowest retail price", () => {
    const r = validateSurpriseSetItems(goodItems, "Set", 8.01);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/lowest-value item/);
  });

  it("is skipped when no price is given", () => {
    expect(validateSurpriseSetItems(goodItems, "Set").ok).toBe(true);
    expect(validateSurpriseSetItems(goodItems, "Set", null).ok).toBe(true);
  });
});

describe("labels and odds", () => {
  it("expands to one unique label per unit", () => {
    const labels = expandSurpriseSetLabels([
      { name: "Solo", quantity: 1, msrpUsd: 5 },
      { name: "Trio", quantity: 3, msrpUsd: 5 },
    ]);
    expect(labels).toEqual(["Solo", "Trio (1 of 3)", "Trio (2 of 3)", "Trio (3 of 3)"]);
    expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(labels.length);
  });

  it("recovers the item name from a unit label", () => {
    expect(surpriseSetItemNameFromLabel("Trio (2 of 3)")).toBe("Trio");
    expect(surpriseSetItemNameFromLabel("Solo")).toBe("Solo");
  });

  it("computes remaining odds after some units are claimed", () => {
    const { rows, remainingUnits } = computeSurpriseSetOdds(goodItems, ["Charizard ex (1 of 3)", "Pikachu promo (4 of 17)"]);
    expect(remainingUnits).toBe(18);
    const char = rows.find((r) => r.name === "Charizard ex")!;
    expect(char.remaining).toBe(2);
    expect(char.odds).toBeCloseTo(2 / 18);
  });

  it("drops fully claimed items from the odds table", () => {
    const { rows } = computeSurpriseSetOdds(
      [{ name: "A", quantity: 1 }, { name: "B", quantity: 2 }],
      ["A"],
    );
    expect(rows.map((r) => r.name)).toEqual(["B"]);
  });
});

describe("Surprise Set shipping weights", () => {
  const withWeights = [
    { name: "Helmet", quantity: 3, msrpUsd: 90, weightOz: 60 },
    { name: "Card pack", quantity: 7, msrpUsd: 90, weightOz: 4 },
  ];

  it("keeps declared weights, and weights are optional", () => {
    const r = validateSurpriseSetItems(withWeights, "Gear set");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items.find((i) => i.name === "Helmet")?.weightOz).toBe(60);
    const none = validateSurpriseSetItems(goodItems, "No weights");
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.items.every((i) => i.weightOz === undefined)).toBe(true);
  });

  it("rejects negative, non-numeric and over-limit weights", () => {
    expect(validateSurpriseSetItems([{ ...withWeights[0]!, weightOz: -5 }, withWeights[1]!], "x").ok).toBe(false);
    expect(validateSurpriseSetItems([{ ...withWeights[0]!, weightOz: Number.NaN }, withWeights[1]!], "x").ok).toBe(false);
    expect(validateSurpriseSetItems([{ ...withWeights[0]!, weightOz: 5000 }, withWeights[1]!], "x").ok).toBe(false);
  });

  it("reads an item's weight from a drawn pool label, including the (k of n) suffix", () => {
    const stored = [
      { name: "Helmet", quantity: 3, msrpUsd: 90, weightOz: 60 },
      { name: "Card pack", quantity: 7, msrpUsd: 90 },
    ];
    expect(surpriseSetWeightOzForLabel(stored, "Helmet (2 of 3)")).toBe(60);
    expect(surpriseSetWeightOzForLabel(stored, "helmet (1 of 3)")).toBe(60);
    expect(surpriseSetWeightOzForLabel(stored, "Card pack (1 of 7)")).toBeNull();
    expect(surpriseSetWeightOzForLabel(stored, "Unknown")).toBeNull();
    expect(surpriseSetWeightOzForLabel(null, "Helmet")).toBeNull();
  });

  it("validates the max ounces per label", () => {
    expect(validateSurpriseSetMaxLabelWeightOz(null)).toEqual({ ok: true, value: null });
    expect(validateSurpriseSetMaxLabelWeightOz("")).toEqual({ ok: true, value: null });
    expect(validateSurpriseSetMaxLabelWeightOz(120)).toEqual({ ok: true, value: 120 });
    expect(validateSurpriseSetMaxLabelWeightOz(2).ok).toBe(false);
    expect(validateSurpriseSetMaxLabelWeightOz(5000).ok).toBe(false);
    expect(validateSurpriseSetMaxLabelWeightOz("abc").ok).toBe(false);
  });
});
