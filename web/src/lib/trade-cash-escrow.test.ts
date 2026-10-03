import { describe, expect, it } from "vitest";
import { isTradeCashHeld } from "@/lib/trade-cash-escrow";

describe("isTradeCashHeld", () => {
  it("is held only when paid and not released/refunded", () => {
    expect(
      isTradeCashHeld({
        cashPaidAt: new Date(),
        cashReleasedAt: null,
        cashRefundedAt: null,
      }),
    ).toBe(true);
    expect(
      isTradeCashHeld({
        cashPaidAt: new Date(),
        cashReleasedAt: new Date(),
        cashRefundedAt: null,
      }),
    ).toBe(false);
    expect(
      isTradeCashHeld({
        cashPaidAt: new Date(),
        cashReleasedAt: null,
        cashRefundedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      isTradeCashHeld({
        cashPaidAt: null,
        cashReleasedAt: null,
        cashRefundedAt: null,
      }),
    ).toBe(false);
  });
});
