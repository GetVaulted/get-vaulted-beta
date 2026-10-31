import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/notify-admins", () => ({ scheduleNotifyAdmins: vi.fn() }));
vi.mock("@/lib/trust/moderation-audit-log", () => ({ logTrustModerationAction: vi.fn() }));

import {
  buyerPurchaseBlock,
  evaluateBuyerRisk,
  evaluateRiskySalePayoutHold,
  paymentMethodTypeBlockedForCardOnly,
  type BuyerRiskInput,
} from "@/lib/buyer-payment-risk";
import {
  stripeCheckoutSessionPaymentOptions,
  stripeOffSessionPaymentIntentOptions,
} from "@/lib/stripe-payment-method-config";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-31T15:00:00Z");

function buyer(overrides: Partial<BuyerRiskInput> = {}): BuyerRiskInput {
  return {
    now: NOW,
    accountCreatedAt: new Date(NOW.getTime() - 400 * DAY),
    phoneVerifiedAt: new Date(NOW.getTime() - 100 * DAY),
    purchasesLockedAt: null,
    settledPaidOrders: 10,
    recentFailedPayments: 0,
    amountCents: 50_00,
    ...overrides,
  };
}

describe("evaluateBuyerRisk", () => {
  it("leaves an established, phone-verified buyer alone at any amount", () => {
    const r = evaluateBuyerRisk(buyer({ amountCents: 5_000_00 }));
    expect(r).toMatchObject({ locked: false, phoneRequired: false, cardOnly: false, force3ds: false });
    expect(buyerPurchaseBlock(r)).toBeNull();
  });

  it("Oct 2026 fraud case: 2-minute-old unverified account buying a $1,260 item is blocked until phone verified, then card-only + 3DS", () => {
    const fraud = buyer({
      accountCreatedAt: new Date(NOW.getTime() - 2 * 60 * 1000),
      phoneVerifiedAt: null,
      settledPaidOrders: 0,
      amountCents: 1_260_00,
    });
    const r = evaluateBuyerRisk(fraud);
    expect(buyerPurchaseBlock(r)?.code).toBe("PHONE_VERIFICATION_REQUIRED");

    const afterVerify = evaluateBuyerRisk({ ...fraud, phoneVerifiedAt: NOW });
    expect(buyerPurchaseBlock(afterVerify)).toBeNull();
    expect(afterVerify).toMatchObject({ cardOnly: true, force3ds: true });
  });

  it("lets a brand-new, unverified account make purchases under $250 with any method", () => {
    const r = evaluateBuyerRisk(
      buyer({ accountCreatedAt: new Date(NOW.getTime() - 10 * DAY), phoneVerifiedAt: null, amountCents: 249_99 }),
    );
    expect(r).toMatchObject({ newBuyer: true, phoneRequired: false, cardOnly: false });
    expect(buyerPurchaseBlock(r)).toBeNull();
  });

  it("requires a phone at $250+ even for an older account, and makes it card-only", () => {
    const r = evaluateBuyerRisk(buyer({ phoneVerifiedAt: null, amountCents: 250_00 }));
    expect(r).toMatchObject({ phoneRequired: true, cardOnly: true });
    expect(evaluateBuyerRisk(buyer({ phoneVerifiedAt: null, amountCents: 249_99 })).phoneRequired).toBe(false);
  });

  it("treats a verified buyer with no settled order history as new for $250+ purchases", () => {
    const r = evaluateBuyerRisk(buyer({ settledPaidOrders: 0, amountCents: 300_00 }));
    expect(r).toMatchObject({ newBuyer: true, phoneRequired: false, cardOnly: true });
  });

  it("does not apply amount rules when the amount is unknown", () => {
    const r = evaluateBuyerRisk(buyer({ settledPaidOrders: 0, phoneVerifiedAt: null, amountCents: null }));
    expect(r).toMatchObject({ phoneRequired: false, cardOnly: false });
  });

  it("auto-locks at 5 failed payments in the window, and stays locked once set", () => {
    expect(evaluateBuyerRisk(buyer({ recentFailedPayments: 4 })).locked).toBe(false);
    const r = evaluateBuyerRisk(buyer({ recentFailedPayments: 5 }));
    expect(r).toMatchObject({ locked: true, shouldAutoLock: true });
    expect(buyerPurchaseBlock(r)?.code).toBe("PURCHASES_LOCKED");

    const already = evaluateBuyerRisk(buyer({ purchasesLockedAt: NOW, recentFailedPayments: 9 }));
    expect(already).toMatchObject({ locked: true, shouldAutoLock: false });
  });
});

describe("paymentMethodTypeBlockedForCardOnly", () => {
  it("allows cards, Apple Pay and Google Pay; blocks Link, Cash App and other wallets", () => {
    for (const t of ["card", "apple_pay", "google_pay", "CARD"]) expect(paymentMethodTypeBlockedForCardOnly(t)).toBe(false);
    for (const t of ["link", "cashapp", "cash_app_pay", "amazon_pay", "paypal", "venmo"]) {
      expect(paymentMethodTypeBlockedForCardOnly(t)).toBe(true);
    }
    expect(paymentMethodTypeBlockedForCardOnly(null)).toBe(false);
  });
});

describe("Stripe payment option builders", () => {
  it("keep today's methods when the purchase is not risky", () => {
    expect(stripeOffSessionPaymentIntentOptions("live").payment_method_types).toContain("link");
    expect(stripeCheckoutSessionPaymentOptions("marketplace", { cardOnly: false }).payment_method_types).toContain("klarna");
  });

  it("go card-only with forced 3DS for risky on-session purchases", () => {
    expect(stripeCheckoutSessionPaymentOptions("marketplace", { cardOnly: true, force3ds: true })).toEqual({
      payment_method_types: ["card"],
      payment_method_options: { card: { request_three_d_secure: "any" } },
    });
    expect(stripeOffSessionPaymentIntentOptions("marketplace", { cardOnly: true, force3ds: true })).toEqual({
      payment_method_types: ["card"],
      payment_method_options: { card: { request_three_d_secure: "any" } },
    });
  });

  it("go card-only without forced 3DS for unattended charges", () => {
    expect(stripeOffSessionPaymentIntentOptions("live", { cardOnly: true })).toEqual({ payment_method_types: ["card"] });
  });
});

describe("evaluateRiskySalePayoutHold", () => {
  const established = {
    orderCreatedAt: new Date(NOW.getTime() - 2 * DAY),
    orderTotalCents: 500_00,
    walletPaymentMethodType: "card",
    buyerAccountCreatedAt: new Date(NOW.getTime() - 400 * DAY),
    buyerSettledPaidOrdersBefore: 8,
    sellerPaidSalesBefore: 50,
  };

  it("does not hold an established buyer paying an established seller by card", () => {
    expect(evaluateRiskySalePayoutHold(established, NOW)).toEqual({ held: false, holdUntil: null, reasons: [] });
  });

  it("Oct 2026 fraud case: holds the helmet sale 14 days from payment, past the day-12 dispute", () => {
    const paid = new Date("2026-10-18T23:18:48Z");
    const r = evaluateRiskySalePayoutHold(
      {
        orderCreatedAt: paid,
        orderTotalCents: 1_260_00,
        walletPaymentMethodType: "link",
        buyerAccountCreatedAt: new Date("2026-10-18T23:07:51Z"),
        buyerSettledPaidOrdersBefore: 0,
        sellerPaidSalesBefore: 1,
      },
      new Date("2026-10-24T22:24:27Z"), // when the seller was actually paid
    );
    expect(r.held).toBe(true);
    expect(r.reasons).toEqual(["new_buyer", "new_seller", "non_card_payment"]);
    expect(r.holdUntil?.toISOString()).toBe("2026-11-01T23:18:48.000Z");
    expect(r.holdUntil!.getTime()).toBeGreaterThan(new Date("2026-10-30T06:23:00Z").getTime()); // dispute opened
  });

  it("never holds a sale under $250, however risky (the $215 order from the same buyer)", () => {
    const r = evaluateRiskySalePayoutHold(
      {
        orderCreatedAt: new Date(NOW.getTime() - DAY),
        orderTotalCents: 215_00,
        walletPaymentMethodType: "link",
        buyerAccountCreatedAt: new Date(NOW.getTime() - DAY),
        buyerSettledPaidOrdersBefore: 0,
        sellerPaidSalesBefore: 0,
      },
      NOW,
    );
    expect(r).toEqual({ held: false, holdUntil: null, reasons: [] });
  });

  it("holds for each single reason and releases once 14 days have passed", () => {
    expect(evaluateRiskySalePayoutHold({ ...established, walletPaymentMethodType: "cash_app_pay" }, NOW).reasons).toEqual([
      "non_card_payment",
    ]);
    expect(evaluateRiskySalePayoutHold({ ...established, sellerPaidSalesBefore: 2 }, NOW).reasons).toEqual(["new_seller"]);
    expect(evaluateRiskySalePayoutHold({ ...established, buyerSettledPaidOrdersBefore: 0 }, NOW).reasons).toEqual([
      "new_buyer",
    ]);
    expect(evaluateRiskySalePayoutHold({ ...established, walletPaymentMethodType: "apple_pay" }, NOW).held).toBe(false);

    const old = { ...established, sellerPaidSalesBefore: 0, orderCreatedAt: new Date(NOW.getTime() - 15 * DAY) };
    expect(evaluateRiskySalePayoutHold(old, NOW)).toMatchObject({ held: false, reasons: ["new_seller"] });
  });
});
