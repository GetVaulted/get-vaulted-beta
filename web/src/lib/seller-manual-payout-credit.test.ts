import { describe, expect, it } from "vitest";
import { planCreditSpend, remainingCreditCents } from "@/lib/seller-manual-payout-credit";

describe("remainingCreditCents", () => {
  it("adds up what is unspent", () => {
    expect(
      remainingCreditCents([
        { amountCents: 10_000, usedCents: 2_500 },
        { amountCents: 5_000, usedCents: 5_000 },
        { amountCents: 1_000, usedCents: 0 },
      ]),
    ).toBe(8_500);
  });
  it("is zero with no credits", () => {
    expect(remainingCreditCents([])).toBe(0);
  });
});

describe("planCreditSpend", () => {
  const rows = [
    { id: "a", amountCents: 10_000, usedCents: 7_000 },
    { id: "b", amountCents: 5_000, usedCents: 0 },
  ];
  it("spends the oldest credit first, then the next", () => {
    expect(planCreditSpend(rows, 4_000)).toEqual([
      { id: "a", takeCents: 3_000, expectedUsedCents: 7_000 },
      { id: "b", takeCents: 1_000, expectedUsedCents: 0 },
    ]);
  });
  it("stays inside one credit when it is enough", () => {
    expect(planCreditSpend(rows, 2_000)).toEqual([{ id: "a", takeCents: 2_000, expectedUsedCents: 7_000 }]);
  });
  it("never takes more than is left", () => {
    const plan = planCreditSpend(rows, 999_999);
    expect(plan.reduce((s, p) => s + p.takeCents, 0)).toBe(8_000);
  });
  it("skips used-up credits and does nothing for zero", () => {
    expect(planCreditSpend([{ id: "x", amountCents: 100, usedCents: 100 }], 50)).toEqual([]);
    expect(planCreditSpend(rows, 0)).toEqual([]);
  });
});
