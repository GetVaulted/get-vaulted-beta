import { beforeEach, describe, expect, it, vi } from "vitest";

const balanceRetrieve = vi.hoisted(() => vi.fn());
const payoutsCreate = vi.hoisted(() => vi.fn());
const planOutstandingLiabilityRecoveryForSeller = vi.hoisted(() => vi.fn());
const applyOutstandingLiabilityRecovery = vi.hoisted(() => vi.fn());
const estimateSellerOrderPayoutUsd = vi.hoisted(() => vi.fn());

const orderStore = vi.hoisted(() => ({ current: null as any }));
const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(async () => orderStore.current),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ data }: any) => ({ ...orderStore.current, ...data })),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    balance: { retrieve: balanceRetrieve },
    payouts: { create: payoutsCreate },
  }),
}));
vi.mock("@/lib/seller-stripe-connect", () => ({
  ensureSellerStripeManualPayouts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/seller-payout-estimate", () => ({
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder: () => 6.75,
  resolveSellerAbsorbedProcessingFeeUsd: () => 0,
}));
vi.mock("@/lib/referral-credit-payout", () => ({
  orderItemSaleBasisUsd: (o: { itemPriceUsd: number }) => o.itemPriceUsd,
}));
vi.mock("@/lib/live-show-gmv", () => ({
  liveShowGmvForFeeTierReconstruction: () => 0,
}));
vi.mock("@/services/shipping/label-liability-recovery", () => ({
  planOutstandingLiabilityRecoveryForSeller,
  applyOutstandingLiabilityRecovery,
}));

import {
  isStripeBankPayoutId,
  orderLabelClawbackSettledForBankPayout,
  orderLooksShippedForBankPayout,
  releaseSellerStripePayout,
} from "@/services/payout/stripe-seller-payout";

describe("stripe-seller-payout helpers", () => {
  it("detects Stripe bank payout ids", () => {
    expect(isStripeBankPayoutId("po_123")).toBe(true);
    expect(isStripeBankPayoutId("tr_123")).toBe(false);
    expect(isStripeBankPayoutId(null)).toBe(false);
  });

  it("treats shipped / carrier / fulfillment as shipped", () => {
    expect(orderLooksShippedForBankPayout({ shippedAt: new Date() })).toBe(true);
    expect(orderLooksShippedForBankPayout({ carrierAcceptedAt: new Date() })).toBe(true);
    expect(orderLooksShippedForBankPayout({ fulfillmentStatus: "in_transit" })).toBe(true);
    expect(orderLooksShippedForBankPayout({ fulfillmentStatus: "pending" })).toBe(false);
  });

  it("requires clawback when a GV label cost exists", () => {
    expect(
      orderLabelClawbackSettledForBankPayout({
        shippoTransactionId: "tx_1",
        shippingLabelCostCents: 607,
        shippingLabelCostReversedCents: 607,
      }),
    ).toBe(true);
    expect(
      orderLabelClawbackSettledForBankPayout({
        shippoTransactionId: "tx_1",
        shippingLabelCostCents: 607,
        shippingLabelCostReversedCents: 0,
      }),
    ).toBe(false);
    expect(orderLabelClawbackSettledForBankPayout({})).toBe(true);
  });
});

function readyOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    sellerId: "seller_1",
    paymentStatus: "paid",
    paymentMethod: "standard",
    sellerPayoutProcessor: "STRIPE",
    processorTransferId: null,
    payoutStatus: "held",
    itemPriceUsd: 50,
    shippingPriceUsd: 5,
    totalUsd: 55,
    referralCreditAppliedUsd: 0,
    platformCreditAppliedUsd: 0,
    stripeProcessingFeeCents: 0,
    shippingLabelCostCents: 0,
    shippingLabelCostReversedCents: 0,
    shippoTransactionId: null,
    labelUrl: null,
    shippedAt: new Date("2026-08-01"),
    carrierAcceptedAt: new Date("2026-08-01"),
    fulfillmentStatus: "shipped",
    status: "shipped",
    liveShippingSessionId: null,
    listing: { isCompanyListing: false },
    liveShippingSession: null,
    seller: {
      stripeAccountId: "acct_1",
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
    },
    ...overrides,
  };
}

/** Empty plan = no outstanding liability for this seller — the pre-existing, unaffected case. */
const NO_LIABILITY_PLAN = { sellerId: "seller_1", items: [], totalCents: 0 };

describe("releaseSellerStripePayout — outstanding liability recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderStore.current = readyOrder();
    estimateSellerOrderPayoutUsd.mockReturnValue(10); // amountCents = 1000
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue(NO_LIABILITY_PLAN);
    applyOutstandingLiabilityRecovery.mockResolvedValue({ appliedCents: 0, skippedCount: 0 });
    balanceRetrieve.mockResolvedValue({ available: [{ currency: "usd", amount: 100_000 }] });
    payoutsCreate.mockResolvedValue({ id: "po_1" });
  });

  it("reduces the payout amount sent to Stripe by the outstanding liability", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });

    const result = await releaseSellerStripePayout("ord_1");

    expect(result.ok).toBe(true);
    expect(payoutsCreate).toHaveBeenCalledTimes(1);
    expect(payoutsCreate.mock.calls[0][0]).toMatchObject({ amount: 700 });
  });

  it("fully withholds the payout (no Stripe payout call at all) when liability >= amount owed", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 1000 }],
      totalCents: 1000,
    });

    const result = await releaseSellerStripePayout("ord_1");

    expect(result).toMatchObject({ ok: true, reason: "withheld_for_liability_recovery" });
    expect(payoutsCreate).not.toHaveBeenCalled();
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 1000 }),
      { method: "payout_offset_stripe", transactionId: "liability-withheld:ord_1" },
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processorTransferId: "liability-withheld:ord_1" }) }),
    );
  });

  it("only records the recovery after the Stripe payout has actually succeeded (not before)", async () => {
    const callOrder: string[] = [];
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    payoutsCreate.mockImplementation(async () => {
      callOrder.push("stripe_payout_created");
      return { id: "po_1" };
    });
    applyOutstandingLiabilityRecovery.mockImplementation(async () => {
      callOrder.push("liability_recorded");
      return { appliedCents: 300, skippedCount: 0 };
    });

    await releaseSellerStripePayout("ord_1");

    expect(callOrder).toEqual(["stripe_payout_created", "liability_recorded"]);
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 300 }),
      { method: "payout_offset_stripe", transactionId: "po_1" },
    );
  });

  it("does not record any liability recovery when the Stripe payout call fails", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    payoutsCreate.mockRejectedValue(new Error("stripe down"));

    const result = await releaseSellerStripePayout("ord_1");

    expect(result).toMatchObject({ ok: false, reason: "stripe_payout_failed" });
    expect(applyOutstandingLiabilityRecovery).not.toHaveBeenCalled();
  });

  it("partial recovery across multiple labels still sends the correctly-reduced payout for the remainder", async () => {
    const plan = {
      sellerId: "seller_1",
      items: [
        { shipmentLabelFinanceId: "lf_old", orderId: "ord_a", shippoTransactionId: "tx_a", amountCents: 200 },
        { shipmentLabelFinanceId: "lf_new", orderId: "ord_b", shippoTransactionId: "tx_b", amountCents: 150 },
      ],
      totalCents: 350,
    };
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue(plan);

    const result = await releaseSellerStripePayout("ord_1");

    expect(result.ok).toBe(true);
    expect(payoutsCreate.mock.calls[0][0]).toMatchObject({ amount: 650 }); // 1000 - 350
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(plan, {
      method: "payout_offset_stripe",
      transactionId: "po_1",
    });
  });

  it("a retried release reuses the same Stripe payout id, so the recovery call is idempotent end-to-end", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    // Stripe's own idempotency key on the create call means a retry returns the SAME payout object.
    payoutsCreate.mockResolvedValue({ id: "po_1" });

    await releaseSellerStripePayout("ord_1");
    await releaseSellerStripePayout("ord_1");

    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledTimes(2);
    const transactionIds = applyOutstandingLiabilityRecovery.mock.calls.map((c: any) => c[1].transactionId);
    expect(transactionIds).toEqual(["po_1", "po_1"]);
  });

  it("does not touch liability recovery at all when there is nothing outstanding (unaffected pre-existing case)", async () => {
    const result = await releaseSellerStripePayout("ord_1");

    expect(result.ok).toBe(true);
    expect(payoutsCreate.mock.calls[0][0]).toMatchObject({ amount: 1000 });
    expect(applyOutstandingLiabilityRecovery).not.toHaveBeenCalled();
  });
});
