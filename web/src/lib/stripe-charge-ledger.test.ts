import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { extractChargeLedgerFromPaymentIntent } from "@/lib/stripe-charge-ledger";
import { connectPaymentIntentTransferData } from "@/lib/sales-tax-charge";

describe("extractChargeLedgerFromPaymentIntent", () => {
  it("reads fee/net from expanded balance_transaction (cents, not dollars)", () => {
    const pi = {
      id: "pi_1",
      latest_charge: {
        id: "ch_1",
        balance_transaction: {
          id: "txn_1",
          fee: 373,
          net: 11452,
          amount: 11825,
        },
        application_fee_amount: 1173,
        application_fee: { id: "fee_1", amount: 1173 },
        transfer: { id: "tr_1" },
      },
    } as unknown as Stripe.PaymentIntent;

    const snap = extractChargeLedgerFromPaymentIntent(pi);
    expect(snap.stripeChargeId).toBe("ch_1");
    expect(snap.stripeBalanceTransactionId).toBe("txn_1");
    expect(snap.stripeProcessingFeeCents).toBe(373);
    expect(snap.stripeApplicationFeeCents).toBe(1173);
    expect(snap.stripeTransferId).toBe("tr_1");
    expect(snap.stripeNetCents).toBe(11452);
  });
});

describe("destination charge fee ownership", () => {
  it("untaxed: seller absorbs processing via inflated application_fee_amount", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 800,
      sellerTransferCents: null,
      processingFeeCents: 373,
    });
    expect(data.application_fee_amount).toBe(1173);
    expect(data.transfer_data).toEqual({ destination: "acct_1" });
  });

  it("taxed: seller absorbs processing via reduced transfer_data.amount", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 800,
      sellerTransferCents: 10200,
      processingFeeCents: 373,
    });
    expect(data.application_fee_amount).toBeUndefined();
    expect(data.transfer_data).toEqual({ destination: "acct_1", amount: 9827 });
  });

  it("tips / zero processing: platform absorbs card fees (processing omitted)", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 0,
      sellerTransferCents: null,
      processingFeeCents: 0,
    });
    expect(data.application_fee_amount).toBe(0);
  });

  it("untaxed: platform-funded referral reduces application_fee_amount", () => {
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 800,
      sellerTransferCents: null,
      processingFeeCents: 373,
      referralCreditAppliedCents: 1000,
    });
    // 800 + 373 − 1000 = 173
    expect(data.application_fee_amount).toBe(173);
    expect(data.transfer_data).toEqual({ destination: "acct_1" });
  });

  it("taxed: platform-funded referral keeps full-basis transfer, clamped to buyer merchandise", () => {
    // Full item $100 + ship $5 − fee $8 = 9700 before processing; buyer paid $90+$5=9500
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 800,
      sellerTransferCents: 9700,
      processingFeeCents: 300,
      referralCreditAppliedCents: 1000,
      maxSellerTransferCents: 9500,
    });
    expect(data.application_fee_amount).toBeUndefined();
    // 9700 − 300 = 9400, under cap 9500
    expect(data.transfer_data).toEqual({ destination: "acct_1", amount: 9400 });
  });

  it("taxed: when referral exceeds fee+processing, transfer clamps to buyer merchandise+shipping", () => {
    // Desired after processing would exceed buyer paid merchandise+shipping
    const data = connectPaymentIntentTransferData({
      destinationAccountId: "acct_1",
      applicationFeeCents: 200,
      sellerTransferCents: 10300, // full $100 + $5 − $2
      processingFeeCents: 100,
      referralCreditAppliedCents: 1000,
      maxSellerTransferCents: 9500, // buyer $90 + $5
    });
    expect(data.transfer_data).toEqual({ destination: "acct_1", amount: 9500 });
  });
});
