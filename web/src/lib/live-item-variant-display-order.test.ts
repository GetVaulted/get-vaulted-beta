import { describe, expect, it } from "vitest";
import { NFL_DIVISIONS_PRESET } from "@/lib/live-item-variant-presets";
import { sortVariantsForBuyerDisplay } from "@/lib/live-item-variant-display-order";

function v(id: string, label: string, sortOrder: number) {
  return { id, label, sortOrder };
}

describe("sortVariantsForBuyerDisplay", () => {
  it("groups all supplementals above NFL divisions (alphabetical regression)", () => {
    const divisions = NFL_DIVISIONS_PRESET.map((d) => v(`div-${d.sortOrder}`, d.label, d.sortOrder));
    const supps = Array.from({ length: 8 }, (_, i) =>
      v(`supp-${i}`, `Break #3 Suppy #${i + 1}`, 8 + i),
    );
    const shuffled = [...divisions.slice(0, 4), ...supps.slice(0, 4), ...divisions.slice(4), ...supps.slice(4)];

    const sorted = sortVariantsForBuyerDisplay(shuffled);
    expect(sorted.slice(0, 8).map((x) => x.label)).toEqual(supps.map((x) => x.label));
    expect(sorted.slice(8).map((x) => x.label)).toEqual(divisions.map((x) => x.label));
  });

  it("orders supplementals with middle-dot labels first", () => {
    const rows = sortVariantsForBuyerDisplay([
      v("1", "AFC East", 0),
      v("2", "Extra · Main Break #1", 8),
      v("3", "NFC West", 7),
      v("4", "Extra · Main Break #2", 9),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("uses sortOrder within each group", () => {
    const rows = sortVariantsForBuyerDisplay([
      v("b", "Suppy B", 10),
      v("a", "Suppy A", 9),
      v("d2", "NFC East", 5),
      v("d1", "AFC East", 0),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "d1", "d2"]);
  });

  it("keeps custom main spots together when no NFL preset labels exist", () => {
    const rows = sortVariantsForBuyerDisplay([
      v("m2", "Team B", 1),
      v("s1", "Bonus Suppy #1", 2),
      v("m1", "Team A", 0),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["s1", "m1", "m2"]);
  });

  it("is stable for equal sortOrder and label", () => {
    const rows = sortVariantsForBuyerDisplay([
      v("first", "Suppy Spot", 8),
      v("second", "Suppy Spot", 8),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["first", "second"]);
  });
});
