import { describe, expect, it } from "vitest";
import {
  bankPayoutPushableUsd,
  selectFifoOrdersWithinAvailable,
} from "@/lib/admin/bank-payout-pushable";

describe("bankPayoutPushableUsd", () => {
  it("never exceeds available", () => {
    expect(bankPayoutPushableUsd(500, 120)).toBe(120);
    expect(bankPayoutPushableUsd(80, 120)).toBe(80);
  });

  it("floors negatives and non-finite to zero", () => {
    expect(bankPayoutPushableUsd(-10, 50)).toBe(0);
    expect(bankPayoutPushableUsd(50, -10)).toBe(0);
    expect(bankPayoutPushableUsd(Number.NaN, 10)).toBe(0);
  });
});

describe("selectFifoOrdersWithinAvailable", () => {
  it("pays oldest orders first and stops before overpay", () => {
    const result = selectFifoOrdersWithinAvailable({
      availableUsdCents: 12_000,
      ordersOldestFirst: [
        { orderId: "a", estimatedNetUsdCents: 5_000 },
        { orderId: "b", estimatedNetUsdCents: 5_000 },
        { orderId: "c", estimatedNetUsdCents: 5_000 },
      ],
    });
    expect(result.selected.map((o) => o.orderId)).toEqual(["a", "b"]);
    expect(result.remainingUsdCents).toBe(2_000);
    expect(result.stoppedOnOrderId).toBe("c");
  });

  it("does not skip ahead when a middle order is too large", () => {
    const result = selectFifoOrdersWithinAvailable({
      availableUsdCents: 10_000,
      ordersOldestFirst: [
        { orderId: "small", estimatedNetUsdCents: 3_000 },
        { orderId: "huge", estimatedNetUsdCents: 20_000 },
        { orderId: "tiny", estimatedNetUsdCents: 1_000 },
      ],
    });
    expect(result.selected.map((o) => o.orderId)).toEqual(["small"]);
    expect(result.stoppedOnOrderId).toBe("huge");
    // tiny must not be selected — would be overpay jump-ahead
    expect(result.selected.find((o) => o.orderId === "tiny")).toBeUndefined();
  });

  it("includes zero-net orders without consuming balance", () => {
    const result = selectFifoOrdersWithinAvailable({
      availableUsdCents: 100,
      ordersOldestFirst: [
        { orderId: "z", estimatedNetUsdCents: 0 },
        { orderId: "a", estimatedNetUsdCents: 100 },
      ],
    });
    expect(result.selected.map((o) => o.orderId)).toEqual(["z", "a"]);
    expect(result.remainingUsdCents).toBe(0);
  });
});
