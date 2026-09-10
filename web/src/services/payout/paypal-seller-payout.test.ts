import { beforeEach, describe, expect, it, vi } from "vitest";

const createSellerPayPalPayout = vi.hoisted(() => vi.fn());
const planOutstandingLiabilityRecoveryForSeller = vi.hoisted(() => vi.fn());
const applyOutstandingLiabilityRecovery = vi.hoisted(() => vi.fn());
const estimateSellerOrderPayoutUsd = vi.hoisted(() => vi.fn());

const orderStore = vi.hoisted(() => ({ current: null as any }));
const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(async () => orderStore.current),
    update: vi.fn(async ({ data }: any) => ({ ...orderStore.current, ...data })),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/paypal", () => ({
  isPayPalSellerPayoutsEnabled: () => true,
  createSellerPayPalPayout,
}));
vi.mock("@/lib/seller-payout-estimate", () => ({
  estimateSellerOrderPayoutUsd,
  resolvePlatformFeePercentForSellerOrder: () => 6.75,
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

import { releaseSellerPayPalPayout } from "@/services/payout/paypal-seller-payout";

function readyOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    sellerId: "seller_1",
    paymentStatus: "paid",
    paymentMethod: "standard",
    sellerPayoutProcessor: "PAYPAL",
    processorTransferId: null,
    payoutStatus: "held",
    itemPriceUsd: 50,
    shippingPriceUsd: 5,
    referralCreditAppliedUsd: 0,
    shippingLabelCostCents: 0,
    shippingLabelCostReversedCents: 0,
    platformFeeCents: 0,
    listing: { isCompanyListing: false },
    liveShippingSession: null,
    seller: {
      paypalPayoutEmail: "seller@example.com",
      paypalPayoutVerifiedAt: new Date("2026-01-01"),
    },
    ...overrides,
  };
}

const NO_LIABILITY_PLAN = { sellerId: "seller_1", items: [], totalCents: 0 };

describe("releaseSellerPayPalPayout — outstanding liability recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderStore.current = readyOrder();
    estimateSellerOrderPayoutUsd.mockReturnValue(10); // amountCents = 1000
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue(NO_LIABILITY_PLAN);
    applyOutstandingLiabilityRecovery.mockResolvedValue({ appliedCents: 0, skippedCount: 0 });
    createSellerPayPalPayout.mockResolvedValue({
      payoutItemId: "item_1",
      feeCents: 25,
      rawStatus: "SUCCESS",
    });
  });

  it("reduces the payout amount sent to PayPal by the outstanding liability", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(true);
    expect(createSellerPayPalPayout).toHaveBeenCalledTimes(1);
    expect(createSellerPayPalPayout.mock.calls[0][0]).toMatchObject({ amountUsd: 7 }); // (1000-300)/100
  });

  it("fully withholds the payout (no PayPal API call at all) when liability >= amount owed", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 1000 }],
      totalCents: 1000,
    });

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result).toMatchObject({ ok: true, reason: "withheld_for_liability_recovery" });
    expect(createSellerPayPalPayout).not.toHaveBeenCalled();
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 1000 }),
      { method: "payout_offset_paypal", transactionId: "liability-withheld:ord_1" },
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processorTransferId: "liability-withheld:ord_1" }) }),
    );
  });

  it("only records the recovery after the PayPal payout has actually succeeded (not before)", async () => {
    const callOrder: string[] = [];
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    createSellerPayPalPayout.mockImplementation(async () => {
      callOrder.push("paypal_payout_created");
      return { payoutItemId: "item_1", feeCents: 0, rawStatus: "SUCCESS" };
    });
    applyOutstandingLiabilityRecovery.mockImplementation(async () => {
      callOrder.push("liability_recorded");
      return { appliedCents: 300, skippedCount: 0 };
    });

    await releaseSellerPayPalPayout("ord_1");

    expect(callOrder).toEqual(["paypal_payout_created", "liability_recorded"]);
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 300 }),
      { method: "payout_offset_paypal", transactionId: "item_1" },
    );
  });

  it("does not record any liability recovery when the PayPal payout call fails", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    createSellerPayPalPayout.mockRejectedValue(new Error("paypal down"));

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(false);
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

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(true);
    expect(createSellerPayPalPayout.mock.calls[0][0]).toMatchObject({ amountUsd: 6.5 }); // (1000-350)/100
    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledWith(plan, {
      method: "payout_offset_paypal",
      transactionId: "item_1",
    });
  });

  it("a retried release reuses the same PayPal payout item id, so the recovery call is idempotent end-to-end", async () => {
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue({
      sellerId: "seller_1",
      items: [{ shipmentLabelFinanceId: "lf_1", orderId: "ord_other", shippoTransactionId: "tx_1", amountCents: 300 }],
      totalCents: 300,
    });
    createSellerPayPalPayout.mockResolvedValue({ payoutItemId: "item_1", feeCents: 0, rawStatus: "SUCCESS" });

    // Simulate two release attempts before the order's processorTransferId is persisted between
    // calls (e.g. two concurrent cron ticks) — both resolve against the same PayPal payout item id.
    await releaseSellerPayPalPayout("ord_1");
    await releaseSellerPayPalPayout("ord_1");

    expect(applyOutstandingLiabilityRecovery).toHaveBeenCalledTimes(2);
    const transactionIds = applyOutstandingLiabilityRecovery.mock.calls.map((c: any) => c[1].transactionId);
    expect(transactionIds).toEqual(["item_1", "item_1"]);
  });

  it("does not touch liability recovery at all when there is nothing outstanding (unaffected pre-existing case)", async () => {
    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(true);
    expect(createSellerPayPalPayout.mock.calls[0][0]).toMatchObject({ amountUsd: 10 });
    expect(applyOutstandingLiabilityRecovery).not.toHaveBeenCalled();
  });
});

describe("releaseSellerPayPalPayout — order-specific label clawback hard gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimateSellerOrderPayoutUsd.mockReturnValue(10);
    planOutstandingLiabilityRecoveryForSeller.mockResolvedValue(NO_LIABILITY_PLAN);
    applyOutstandingLiabilityRecovery.mockResolvedValue({ appliedCents: 0, skippedCount: 0 });
    createSellerPayPalPayout.mockResolvedValue({
      payoutItemId: "item_1",
      feeCents: 25,
      rawStatus: "SUCCESS",
    });
  });

  it("blocks release and flags manual_review when this order's own GV label cost hasn't been clawed back yet", async () => {
    orderStore.current = readyOrder({
      shippoTransactionId: "shippo_tx_1",
      shippingLabelCostCents: 800,
      shippingLabelCostReversedCents: 0,
    });

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result).toMatchObject({ ok: false, reason: "label_clawback_pending" });
    expect(createSellerPayPalPayout).not.toHaveBeenCalled();
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: "ord_1" },
      data: {
        payoutStatus: "manual_review",
        payoutBlockedReason: "label_clawback_pending_before_bank_payout",
      },
    });
  });

  it("releases normally once the label cost has been fully reversed/clawed back", async () => {
    orderStore.current = readyOrder({
      shippoTransactionId: "shippo_tx_1",
      shippingLabelCostCents: 800,
      shippingLabelCostReversedCents: 800,
    });

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(true);
    expect(createSellerPayPalPayout).toHaveBeenCalledTimes(1);
  });

  it("releases normally when there was never a Get Vaulted label on the order", async () => {
    orderStore.current = readyOrder({
      shippoTransactionId: null,
      labelUrl: null,
      shippingLabelCostCents: 0,
      shippingLabelCostReversedCents: 0,
    });

    const result = await releaseSellerPayPalPayout("ord_1");

    expect(result.ok).toBe(true);
    expect(createSellerPayPalPayout).toHaveBeenCalledTimes(1);
  });
});
