import { describe, expect, it } from "vitest";
import {
  canBuyerUpdateOrderShipping,
  canSellerCreateShippingLabel,
  isIncompleteOrderShipping,
  labelStatusForSession,
  orderIsSettledForBundling,
  sellerMayMarkOrderShipped,
  sellerMayShowFulfillmentControls,
} from "@/lib/order-shipping-guards";

function paidOrder(overrides: Partial<Parameters<typeof orderIsSettledForBundling>[0]> = {}) {
  return {
    status: "paid",
    shippoTransactionId: null,
    labelUrl: null,
    fulfillmentStatus: null,
    ...overrides,
  };
}

describe("isIncompleteOrderShipping", () => {
  it("treats auction-win placeholders as incomplete", () => {
    expect(
      isIncompleteOrderShipping({
        shipAddress: "Coordinate shipping with the seller",
        shipCity: "—",
        shipState: "—",
        shipZip: "00000",
      }),
    ).toBe(true);
  });

  it("accepts a real US ship-to", () => {
    expect(
      isIncompleteOrderShipping({
        shipAddress: "123 Main St",
        shipCity: "Austin",
        shipState: "TX",
        shipZip: "78701",
      }),
    ).toBe(false);
  });
});

describe("canSellerCreateShippingLabel", () => {
  it("rejects unpaid orders", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "pending_payment",
      shippoTransactionId: null,
      labelUrl: null,
    });
    expect(r).toEqual({ ok: false, code: "UNPAID" });
  });

  it("rejects when a healthy label transaction already exists", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "paid",
      shippoTransactionId: "txn_1",
      labelUrl: null,
      fulfillmentStatus: "label_created",
    });
    expect(r).toEqual({ ok: false, code: "LABEL_EXISTS" });
  });

  it("allows retry when prior Shippo attempt is in exception", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "paid",
      shippoTransactionId: "txn_1",
      labelUrl: null,
      fulfillmentStatus: "exception",
    });
    expect(r).toEqual({ ok: true });
  });

  it("rejects when labelUrl set", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "paid",
      shippoTransactionId: null,
      labelUrl: "https://example/label.pdf",
    });
    expect(r).toEqual({ ok: false, code: "LABEL_EXISTS" });
  });

  it("allows paid order without label", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "paid",
      shippoTransactionId: null,
      labelUrl: null,
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("sellerMayMarkOrderShipped", () => {
  it("rejects pending_payment", () => {
    expect(sellerMayMarkOrderShipped({ paymentStatus: "pending_payment", status: "pending" })).toEqual({
      ok: false,
      code: "UNPAID",
    });
  });

  it("allows paid + pending lifecycle", () => {
    expect(sellerMayMarkOrderShipped({ paymentStatus: "paid", status: "pending" })).toEqual({ ok: true });
  });
});

describe("sellerMayShowFulfillmentControls", () => {
  it("hides controls for unpaid and terminal payment states", () => {
    expect(sellerMayShowFulfillmentControls({ paymentStatus: "pending_payment" })).toBe(false);
    expect(sellerMayShowFulfillmentControls({ paymentStatus: "failed" })).toBe(false);
    expect(sellerMayShowFulfillmentControls({ paymentStatus: "expired" })).toBe(false);
    expect(sellerMayShowFulfillmentControls({ paymentStatus: "paid" })).toBe(true);
  });
});

describe("canBuyerUpdateOrderShipping", () => {
  it("allows paid order with no label", () => {
    expect(
      canBuyerUpdateOrderShipping({
        status: "paid",
        labelUrl: null,
        shippoTransactionId: null,
      }),
    ).toEqual({ ok: true });
  });

  it("allows exception retry when no label PDF", () => {
    expect(
      canBuyerUpdateOrderShipping({
        status: "paid",
        labelUrl: null,
        shippoTransactionId: "txn_1",
        fulfillmentStatus: "exception",
      }),
    ).toEqual({ ok: true });
  });

  it("blocks when label exists", () => {
    expect(
      canBuyerUpdateOrderShipping({
        status: "paid",
        labelUrl: "https://example/label.pdf",
        shippoTransactionId: null,
      }),
    ).toEqual({ ok: false, code: "LABEL_EXISTS" });
  });

  it("blocks shipped and terminal statuses", () => {
    expect(
      canBuyerUpdateOrderShipping({
        status: "shipped",
        labelUrl: null,
        shippoTransactionId: null,
      }),
    ).toEqual({ ok: false, code: "ALREADY_SHIPPED" });
    expect(
      canBuyerUpdateOrderShipping({
        status: "delivered",
        labelUrl: null,
        shippoTransactionId: null,
      }),
    ).toEqual({ ok: false, code: "TERMINAL" });
  });
});

describe("orderIsSettledForBundling", () => {
  it("is not settled while paid/pending with no label — still needs a bundled-ship action", () => {
    expect(orderIsSettledForBundling(paidOrder({ status: "paid" }))).toBe(false);
    expect(orderIsSettledForBundling(paidOrder({ status: "pending" }))).toBe(false);
  });

  it("is settled once a usable label exists", () => {
    expect(orderIsSettledForBundling(paidOrder({ shippoTransactionId: "tr_1" }))).toBe(true);
    expect(orderIsSettledForBundling(paidOrder({ labelUrl: "https://example.com/label.pdf" }))).toBe(true);
  });

  it("is settled once shipped via the seller's own carrier, even with no label at all", () => {
    // Regression: PATCH /api/orders/[id] markShipped sets status: 'shipped' but never a
    // shippoTransactionId/labelUrl for an own-carrier ship. Before this fix the order stayed
    // 'not settled' forever, so the bundle-ship button never went away, and re-clicking it
    // always found zero orders eligible ("No orders in this bundle are ready to be marked shipped.").
    expect(orderIsSettledForBundling(paidOrder({ status: "shipped" }))).toBe(true);
  });

  it("also treats delivered/cancelled/refunded as settled (nothing left to do)", () => {
    expect(orderIsSettledForBundling(paidOrder({ status: "delivered" }))).toBe(true);
    expect(orderIsSettledForBundling(paidOrder({ status: "cancelled" }))).toBe(true);
    expect(orderIsSettledForBundling(paidOrder({ status: "refunded" }))).toBe(true);
  });
});

describe("labelStatusForSession", () => {
  it("is empty for no orders and awaiting_payment when nothing is paid yet", () => {
    expect(labelStatusForSession([])).toBe("empty");
    expect(
      labelStatusForSession([{ status: "pending", paymentStatus: "pending", shippoTransactionId: null, labelUrl: null }]),
    ).toBe("awaiting_payment");
  });

  it("is labels_needed when paid orders have neither a label nor a ship action yet", () => {
    expect(
      labelStatusForSession([paidOrder(), paidOrder()].map((o) => ({ ...o, paymentStatus: "paid" }))),
    ).toBe("labels_needed");
  });

  it("is partial when some paid orders are settled and some are not", () => {
    expect(
      labelStatusForSession([
        { ...paidOrder({ shippoTransactionId: "tr_1" }), paymentStatus: "paid" },
        { ...paidOrder(), paymentStatus: "paid" },
      ]),
    ).toBe("partial");
  });

  it("is complete once every paid order is settled — including an all-own-carrier bundle with zero labels", () => {
    // The actual bug report: seller ships an entire bundle themselves (no Shippo label on any
    // order in the session). Before this fix labelStatusForSession never saw a labeled order in
    // that case and reported 'labels_needed' forever instead of 'complete'.
    expect(
      labelStatusForSession([
        { ...paidOrder({ status: "shipped" }), paymentStatus: "paid" },
        { ...paidOrder({ status: "shipped" }), paymentStatus: "paid" },
      ]),
    ).toBe("complete");
  });
});
