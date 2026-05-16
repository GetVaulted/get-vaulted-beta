import { describe, expect, it } from "vitest";
import {
  buildSellerWalletSummary,
  describePayoutSchedule,
  pickNextPayoutFromList,
} from "@/lib/stripe-connect-wallet-summary";
import type Stripe from "stripe";

describe("stripe-connect-wallet-summary", () => {
  it("formats available and pending balances", () => {
    const summary = buildSellerWalletSummary({
      stripeConfigured: true,
      hasStripeAccount: true,
      balance: {
        object: "balance",
        available: [{ amount: 12500, currency: "usd" }],
        pending: [{ amount: 3400, currency: "usd" }],
        livemode: false,
      } as Stripe.Balance,
      payouts: [],
      payoutSchedule: { interval: "daily", delay_days: 2 },
    });
    expect(summary.availableFormatted).toBe("$125.00");
    expect(summary.pendingFormatted).toBe("$34.00");
  });

  it("picks earliest pending payout arrival", () => {
    const picked = pickNextPayoutFromList([
      {
        id: "po_2",
        object: "payout",
        amount: 5000,
        currency: "usd",
        arrival_date: 2000000000,
        status: "pending",
      } as Stripe.Payout,
      {
        id: "po_1",
        object: "payout",
        amount: 1000,
        currency: "usd",
        arrival_date: 1900000000,
        status: "in_transit",
      } as Stripe.Payout,
    ]);
    expect(picked?.at.getTime()).toBe(1900000000 * 1000);
  });

  it("describes manual schedule", () => {
    expect(describePayoutSchedule({ interval: "manual", delay_days: 0 })).toContain("Manual");
  });
});
