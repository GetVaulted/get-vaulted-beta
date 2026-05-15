import { describe, expect, it } from "vitest";
import { canSellerCreateShippingLabel } from "@/lib/order-shipping-guards";

describe("canSellerCreateShippingLabel", () => {
  it("rejects unpaid orders", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "pending_payment",
      shippoTransactionId: null,
      labelUrl: null,
    });
    expect(r).toEqual({ ok: false, code: "UNPAID" });
  });

  it("rejects when label already exists", () => {
    const r = canSellerCreateShippingLabel({
      paymentStatus: "paid",
      shippoTransactionId: "txn_1",
      labelUrl: null,
    });
    expect(r).toEqual({ ok: false, code: "LABEL_EXISTS" });
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
