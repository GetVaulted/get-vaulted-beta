import { describe, expect, it } from "vitest";
import {
  bankPayoutPushableUsd,
  planLumpPayoutCents,
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

describe("planLumpPayoutCents", () => {
  it("sends the entire available balance in one lump when more shipped orders are waiting than it covers", () => {
    const plan = planLumpPayoutCents({
      availableUsdCents: 23_514,
      ordersOldestFirst: [
        { orderId: "a", estimatedNetUsdCents: 10_000 },
        { orderId: "b", estimatedNetUsdCents: 10_000 },
        { orderId: "c", estimatedNetUsdCents: 10_000 },
      ],
    });
    expect(plan.coveredOrderIds).toEqual(["a", "b"]);
    expect(plan.coveredCents).toBe(20_000);
    expect(plan.sweepCents).toBe(3_514);
    expect(plan.lumpCents).toBe(23_514);
  });

  it("never sweeps beyond the ready orders (the rest of the balance belongs to unshipped orders)", () => {
    const plan = planLumpPayoutCents({
      availableUsdCents: 50_000,
      ordersOldestFirst: [{ orderId: "a", estimatedNetUsdCents: 10_000 }],
    });
    expect(plan.lumpCents).toBe(10_000);
    expect(plan.sweepCents).toBe(0);
  });

  it("is zero with no ready orders or no balance", () => {
    expect(planLumpPayoutCents({ availableUsdCents: 9_999, ordersOldestFirst: [] }).lumpCents).toBe(0);
    expect(
      planLumpPayoutCents({ availableUsdCents: 0, ordersOldestFirst: [{ orderId: "a", estimatedNetUsdCents: 500 }] })
        .lumpCents,
    ).toBe(0);
  });
});
