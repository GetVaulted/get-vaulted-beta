import { describe, expect, it } from "vitest";
import { addressKey, evaluateOrderRisk, isLiveRiskOrder } from "./buyer-risk-rules";

const d = (s: string) => new Date(s);

describe("buyer-risk-watch", () => {
  it("flags a big order from a brand-new account", () => {
    expect(
      evaluateOrderRisk({
        buyerCreatedAt: d("2026-10-18T23:07:00Z"),
        orderCreatedAt: d("2026-10-18T23:11:00Z"),
        itemPriceUsd: 215,
        sharedAddress: false,
      }),
    ).toEqual(["new_account_big_order"]);
  });

  it("ignores small orders and older accounts", () => {
    expect(
      evaluateOrderRisk({ buyerCreatedAt: d("2026-10-18T00:00:00Z"), orderCreatedAt: d("2026-10-18T01:00:00Z"), itemPriceUsd: 199.99, sharedAddress: true }),
    ).toEqual([]);
    expect(
      evaluateOrderRisk({ buyerCreatedAt: d("2026-08-01T00:00:00Z"), orderCreatedAt: d("2026-10-18T01:00:00Z"), itemPriceUsd: 900, sharedAddress: false }),
    ).toEqual([]);
  });

  it("flags a shared address even on an older account", () => {
    expect(
      evaluateOrderRisk({ buyerCreatedAt: d("2026-08-01T00:00:00Z"), orderCreatedAt: d("2026-10-18T01:00:00Z"), itemPriceUsd: 900, sharedAddress: true }),
    ).toEqual(["shared_address_big_order"]);
  });

  it("flags both when both apply and honors custom thresholds", () => {
    expect(
      evaluateOrderRisk({ buyerCreatedAt: d("2026-10-18T00:00:00Z"), orderCreatedAt: d("2026-10-19T00:00:00Z"), itemPriceUsd: 900, sharedAddress: true }),
    ).toEqual(["new_account_big_order", "shared_address_big_order"]);
    expect(
      evaluateOrderRisk({ buyerCreatedAt: d("2026-10-18T00:00:00Z"), orderCreatedAt: d("2026-10-19T00:00:00Z"), itemPriceUsd: 150, sharedAddress: false, minUsd: 100 }),
    ).toEqual(["new_account_big_order"]);
  });

  it("normalises addresses and ignores weak ones", () => {
    expect(addressKey("12327 Seward St.", "68154-1344")).toBe(addressKey("12327 seward st", "68154"));
    expect(addressKey("PO 1", "68154")).toBe("");
    expect(addressKey("12327 Seward St", "")).toBe("");
  });

  it("treats paid and open orders as live, not cancelled ones", () => {
    expect(isLiveRiskOrder({ paymentStatus: "paid", status: "shipped" })).toBe(true);
    expect(isLiveRiskOrder({ paymentStatus: "pending_payment", status: "pending" })).toBe(true);
    expect(isLiveRiskOrder({ paymentStatus: "failed", status: "cancelled" })).toBe(false);
  });
});
