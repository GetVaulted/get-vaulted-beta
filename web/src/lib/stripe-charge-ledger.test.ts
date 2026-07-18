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
});
