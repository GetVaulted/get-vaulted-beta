import { describe, expect, it } from "vitest";
import {
  LIVE_ORDER_RETURN_WINDOW_MS,
  orderIsInTransitForRefund,
  resolveLiveOrderRefundEligibility,
} from "@/lib/order-refund-eligibility";

const base = {
  paymentStatus: "paid",
  paymentMethod: "stripe",
  status: "paid",
  fulfillmentStatus: "pending",
  shippedAt: null as Date | null,
  deliveryConfirmedAt: null as Date | null,
  liveShowId: "show_1",
};

describe("resolveLiveOrderRefundEligibility", () => {
  it("allows pre-ship cancel for paid live orders", () => {
    expect(resolveLiveOrderRefundEligibility(base)).toEqual({ kind: "cancel", blockedReason: null });
  });

  it("blocks non-live orders", () => {
    expect(resolveLiveOrderRefundEligibility({ ...base, liveShowId: null }).blockedReason).toBe("NOT_LIVE_ORDER");
  });

  it("blocks in-transit requests", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...base,
      status: "shipped",
      fulfillmentStatus: "in_transit",
    });
    expect(r.kind).toBeNull();
    expect(r.blockedReason).toBe("IN_TRANSIT");
  });

  it("allows return within 2 days of delivery", () => {
    const deliveredAt = new Date(Date.now() - LIVE_ORDER_RETURN_WINDOW_MS + 60_000);
    const r = resolveLiveOrderRefundEligibility({
      ...base,
      status: "delivered",
      fulfillmentStatus: "delivered",
      deliveryConfirmedAt: deliveredAt,
    });
    expect(r.kind).toBe("return");
  });

  it("blocks return after window", () => {
    const deliveredAt = new Date(Date.now() - LIVE_ORDER_RETURN_WINDOW_MS - 60_000);
    const r = resolveLiveOrderRefundEligibility({
      ...base,
      status: "delivered",
      fulfillmentStatus: "delivered",
      deliveryConfirmedAt: deliveredAt,
    });
    expect(r.blockedReason).toBe("RETURN_WINDOW_EXPIRED");
  });
});

describe("orderIsInTransitForRefund", () => {
  it("detects shipped orders", () => {
    expect(orderIsInTransitForRefund({ status: "shipped", fulfillmentStatus: "pending" })).toBe(true);
  });
});
