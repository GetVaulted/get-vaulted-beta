import { describe, expect, it } from "vitest";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { deriveBuyerLayawayUi } from "@/lib/layaway/buyer-ui-status";

const base = {
  amountPaidUsd: 225,
  depositAmountUsd: 225,
  remainingBalanceUsd: 674.99,
  orderPaymentStatus: PAYMENT_LAYAWAY_ACTIVE,
};

describe("deriveBuyerLayawayUi", () => {
  it("active layaway with balance due allows payments", () => {
    const ui = deriveBuyerLayawayUi({ ...base, status: "active" });
    expect(ui.phase).toBe("active");
    expect(ui.canMakePayment).toBe(true);
    expect(ui.badgeLabel).toBe("Active");
    expect(ui.message).toBeNull();
  });

  it("completed layaway hides payments", () => {
    const ui = deriveBuyerLayawayUi({
      ...base,
      status: "completed",
      remainingBalanceUsd: 0,
      amountPaidUsd: 899.99,
    });
    expect(ui.phase).toBe("completed");
    expect(ui.canMakePayment).toBe(false);
    expect(ui.badgeLabel).toBe("Paid in full");
  });

  it("defaulted layaway hides payments", () => {
    const ui = deriveBuyerLayawayUi({ ...base, status: "defaulted" });
    expect(ui.phase).toBe("defaulted");
    expect(ui.canMakePayment).toBe(false);
    expect(ui.message).toContain("defaulted");
  });

  it("refunded layaway hides payments", () => {
    const ui = deriveBuyerLayawayUi({ ...base, status: "refunded" });
    expect(ui.phase).toBe("refunded");
    expect(ui.canMakePayment).toBe(false);
    expect(ui.badgeLabel).toBe("Canceled");
  });

  it("deposit not confirmed shows pending deposit, not balance payments", () => {
    const ui = deriveBuyerLayawayUi({
      status: "active",
      amountPaidUsd: 0,
      depositAmountUsd: 225,
      remainingBalanceUsd: 674.99,
      orderPaymentStatus: "pending",
    });
    expect(ui.phase).toBe("pending_deposit");
    expect(ui.canMakePayment).toBe(false);
    expect(ui.badgeLabel).toBe("Deposit pending");
    expect(ui.message).toContain("deposit");
  });

  it("active status without layaway_active order is inactive when deposit was paid", () => {
    const ui = deriveBuyerLayawayUi({
      ...base,
      status: "active",
      orderPaymentStatus: "pending",
    });
    expect(ui.phase).toBe("inactive");
    expect(ui.canMakePayment).toBe(false);
  });
});
