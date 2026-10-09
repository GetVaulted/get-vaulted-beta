import { describe, expect, it } from "vitest";
import {
  SURPRISE_SET_MAX_UNITS,
  computeSurpriseSetOdds,
  expandSurpriseSetLabels,
  findProhibitedSurpriseWording,
  surpriseSetItemNameFromLabel,
  validateSurpriseSetItems,
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

  it("rejects when the highest-value item is under 5% likely", () => {
    const r = validateSurpriseSetItems(
      [
        { name: "Chase card", quantity: 1, msrpUsd: 200 },
        { name: "Common pack", quantity: 39, msrpUsd: 5 },
      ],
      "Set",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/at least a 5% chance/);
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
