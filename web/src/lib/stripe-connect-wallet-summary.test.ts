import { describe, expect, it } from "vitest";
import {
  buildSellerWalletSummary,
  describeBalanceTransaction,
  describePayoutSchedule,
  mapRecentPayouts,
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
    expect(summary.recentPayouts).toEqual([]);
    expect(summary.recentActivity).toEqual([]);
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

  it("includes paid payouts in recent history with bank destination copy", () => {
    const rows = mapRecentPayouts([
      {
        id: "po_paid",
        object: "payout",
        amount: 8200,
        currency: "usd",
        arrival_date: 1900000000,
        created: 1899990000,
        status: "paid",
      } as Stripe.Payout,
      {
        id: "po_pending",
        object: "payout",
        amount: 1000,
        currency: "usd",
        arrival_date: 2000000000,
        created: 1899980000,
        status: "pending",
      } as Stripe.Payout,
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("po_paid");
    expect(rows[0]?.statusLabel).toBe("Sent");
    expect(rows[0]?.destinationLabel).toMatch(/bank/i);
    expect(rows[0]?.amountFormatted).toBe("$82.00");
  });

  it("explains payout and label-style deductions for sellers", () => {
    expect(describeBalanceTransaction({ type: "payout", amount: -5000, description: null })).toEqual({
      title: "Payout to bank",
      description: "Sent from your Stripe balance to your linked bank account.",
    });
    expect(
      describeBalanceTransaction({
        type: "adjustment",
        amount: -725,
        description: "Shippo label clawback",
      }).title,
    ).toBe("Shipping label cost");
  });

  it("surfaces recent activity on the summary", () => {
    const summary = buildSellerWalletSummary({
      stripeConfigured: true,
      hasStripeAccount: true,
      balance: {
        object: "balance",
        available: [{ amount: 0, currency: "usd" }],
        pending: [],
        livemode: false,
      } as Stripe.Balance,
      payouts: [
        {
          id: "po_1",
          object: "payout",
          amount: 5000,
          currency: "usd",
          arrival_date: 1900000000,
          created: 1899990000,
          status: "paid",
        } as Stripe.Payout,
      ],
      balanceTransactions: [
        {
          id: "txn_1",
          object: "balance_transaction",
          amount: -5000,
          currency: "usd",
          type: "payout",
          created: 1899990000,
          description: null,
        } as Stripe.BalanceTransaction,
      ],
      payoutSchedule: { interval: "daily", delay_days: 2 },
    });
    expect(summary.recentPayouts).toHaveLength(1);
    expect(summary.recentActivity[0]?.title).toBe("Payout to bank");
    expect(summary.recentActivity[0]?.amountFormatted).toBe("−$50.00");
  });

  it("describes manual schedule", () => {
    expect(describePayoutSchedule({ interval: "manual", delay_days: 0 })).toContain("Manual");
  });
});
