import { describe, expect, it } from "vitest";
import {
  LIVE_ORDER_RETURN_WINDOW_MS,
  orderHasPurchasedShippingLabel,
  orderIsInTransitForRefund,
  resolveLiveOrderRefundEligibility,
} from "@/lib/order-refund-eligibility";

const liveBase = {
  paymentStatus: "paid",
  paymentMethod: "stripe",
  status: "paid",
  fulfillmentStatus: "pending",
  shippedAt: null as Date | null,
  deliveryConfirmedAt: null as Date | null,
  liveShowId: "show_1",
  labelUrl: null as string | null,
  shippoTransactionId: null as string | null,
};

const marketplaceBase = {
  ...liveBase,
  liveShowId: null,
};

describe("resolveLiveOrderRefundEligibility", () => {
  it("allows pre-ship cancel for paid live orders", () => {
    expect(resolveLiveOrderRefundEligibility(liveBase)).toEqual({ kind: "cancel", blockedReason: null });
  });

  it("allows marketplace cancel when paid, unshipped, and no label", () => {
    expect(resolveLiveOrderRefundEligibility(marketplaceBase)).toEqual({
      kind: "cancel",
      blockedReason: null,
    });
  });

  it("blocks marketplace cancel when a Get Vaulted label exists", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...marketplaceBase,
      labelUrl: "https://shippo.example/label.pdf",
    });
    expect(r.kind).toBeNull();
    expect(r.blockedReason).toBe("LABEL_EXISTS");
  });

  it("blocks marketplace cancel when shippoTransactionId is set", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...marketplaceBase,
      shippoTransactionId: "txn_abc",
    });
    expect(r.blockedReason).toBe("LABEL_EXISTS");
  });

  it("blocks marketplace cancel when shipped / in transit", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...marketplaceBase,
      status: "shipped",
      fulfillmentStatus: "in_transit",
    });
    expect(r.kind).toBeNull();
    expect(r.blockedReason).toBe("IN_TRANSIT");
  });

  it("does not offer marketplace return after delivery", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...marketplaceBase,
      status: "delivered",
      fulfillmentStatus: "delivered",
      deliveryConfirmedAt: new Date(),
    });
    expect(r.kind).toBeNull();
    expect(r.blockedReason).toBe("NOT_ELIGIBLE");
  });

  it("blocks live in-transit requests", () => {
    const r = resolveLiveOrderRefundEligibility({
      ...liveBase,
      status: "shipped",
      fulfillmentStatus: "in_transit",
    });
    expect(r.kind).toBeNull();
    expect(r.blockedReason).toBe("IN_TRANSIT");
  });

  it("allows live return within 2 days of delivery", () => {
    const deliveredAt = new Date(Date.now() - LIVE_ORDER_RETURN_WINDOW_MS + 60_000);
    const r = resolveLiveOrderRefundEligibility({
      ...liveBase,
      status: "delivered",
      fulfillmentStatus: "delivered",
      deliveryConfirmedAt: deliveredAt,
    });
    expect(r.kind).toBe("return");
  });

  it("blocks live return after window", () => {
    const deliveredAt = new Date(Date.now() - LIVE_ORDER_RETURN_WINDOW_MS - 60_000);
    const r = resolveLiveOrderRefundEligibility({
      ...liveBase,
      status: "delivered",
      fulfillmentStatus: "delivered",
      deliveryConfirmedAt: deliveredAt,
    });
    expect(r.blockedReason).toBe("RETURN_WINDOW_EXPIRED");
  });

  it("still allows live cancel even if a label exists (live gate unchanged)", () => {
    expect(
      resolveLiveOrderRefundEligibility({
        ...liveBase,
        labelUrl: "https://shippo.example/label.pdf",
      }),
    ).toEqual({ kind: "cancel", blockedReason: null });
  });
});

describe("orderHasPurchasedShippingLabel", () => {
  it("detects labelUrl or shippoTransactionId", () => {
    expect(orderHasPurchasedShippingLabel({ labelUrl: "https://x", shippoTransactionId: null })).toBe(true);
    expect(orderHasPurchasedShippingLabel({ labelUrl: null, shippoTransactionId: "txn" })).toBe(true);
    expect(orderHasPurchasedShippingLabel({ labelUrl: "  ", shippoTransactionId: null })).toBe(false);
  });
});

describe("orderIsInTransitForRefund", () => {
  it("detects shipped orders", () => {
    expect(orderIsInTransitForRefund({ status: "shipped", fulfillmentStatus: "pending" })).toBe(true);
  });
});
