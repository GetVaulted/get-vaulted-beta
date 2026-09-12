import { describe, expect, it } from "vitest";
import {
  canBuyerUpdateOrderShipping,
  canSellerCreateShippingLabel,
  isIncompleteOrderShipping,
  sellerMayMarkOrderShipped,
  sellerMayShowFulfillmentControls,
} from "@/lib/order-shipping-guards";

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
