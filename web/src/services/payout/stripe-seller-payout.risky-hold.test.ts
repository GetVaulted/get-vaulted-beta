import { beforeEach, describe, expect, it, vi } from "vitest";

const payoutsCreate = vi.hoisted(() => vi.fn());
const balanceRetrieve = vi.hoisted(() => vi.fn());
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose fixture, same as seller-lock test
const orderStore = vi.hoisted(() => ({ current: null as any }));
const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(async () => orderStore.current),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
  },
}));

const riskHold = vi.hoisted(() => vi.fn());
vi.mock("@/lib/buyer-payment-risk", () => ({ loadRiskySalePayoutHold: riskHold }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ balance: { retrieve: balanceRetrieve }, payouts: { create: payoutsCreate } }),
}));
vi.mock("@/lib/seller-stripe-connect", () => ({
  ensureSellerStripeManualPayouts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/seller-payout-estimate", () => ({
  estimateSellerOrderPayoutUsd: vi.fn(),
  resolvePlatformFeePercentForSellerOrder: () => 6.75,
  resolveSellerAbsorbedProcessingFeeUsd: () => 0,
}));
vi.mock("@/lib/referral-credit-payout", () => ({
  orderItemSaleBasisUsd: (o: { itemPriceUsd: number }) => o.itemPriceUsd,
}));
vi.mock("@/lib/live-show-gmv", () => ({ liveShowGmvForFeeTierReconstruction: () => 0 }));
vi.mock("@/services/shipping/label-liability-recovery", () => ({
  planOutstandingLiabilityRecoveryForSeller: vi.fn(),
  applyOutstandingLiabilityRecovery: vi.fn(),
}));

import { releaseSellerStripePayout } from "@/services/payout/stripe-seller-payout";

function order(overrides: Record<string, unknown> = {}, sellerOverrides: Record<string, unknown> = {}) {
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
    shippedAt: new Date(),
    carrierAcceptedAt: new Date(),
    fulfillmentStatus: "shipped",
    status: "shipped",
    shippoTransactionId: null,
    labelUrl: null,
    shippingLabelCostCents: 0,
    shippingLabelCostReversedCents: 0,
    liveShippingSessionId: null,
    listing: { isCompanyListing: false },
    liveShippingSession: null,
    seller: {
      sellerLockedAt: null,
      stripeAccountId: "acct_1",
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
      ...sellerOverrides,
    },
    ...overrides,
  };
}

describe("releaseSellerStripePayout — risky-sale payout hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to pay out a held sale, even with force or planOnly, and creates no Stripe payout", async () => {
    orderStore.current = order();
    riskHold.mockResolvedValue({ held: true, holdUntil: new Date(Date.now() + 86400000), reasons: ["new_buyer"] });
    for (const opts of [undefined, { force: true }, { planOnly: true }]) {
      expect(await releaseSellerStripePayout("ord_1", opts)).toEqual({ ok: false, reason: "risky_sale_hold" });
    }
    expect(payoutsCreate).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("holds the payout when the risk check itself fails (fails closed)", async () => {
    orderStore.current = order();
    riskHold.mockRejectedValue(new Error("db down"));
    expect(await releaseSellerStripePayout("ord_1", { force: true })).toEqual({
      ok: false,
      reason: "risky_sale_hold",
    });
    expect(payoutsCreate).not.toHaveBeenCalled();
  });

  it("reports more specific problems (not shipped) before the hold", async () => {
    orderStore.current = order({ shippedAt: null, carrierAcceptedAt: null, fulfillmentStatus: "pending", status: "paid" });
    riskHold.mockResolvedValue({ held: true, holdUntil: null, reasons: ["new_buyer"] });
    expect(await releaseSellerStripePayout("ord_1")).toEqual({ ok: false, reason: "not_shipped" });
  });

  it("does not stop the payout once the hold has ended", async () => {
    orderStore.current = order();
    riskHold.mockResolvedValue({ held: false, holdUntil: null, reasons: [] });
    // Later payout steps need more mocks than this test sets up; reaching them at all proves the hold let it by.
    const res = await releaseSellerStripePayout("ord_1", { planOnly: true }).catch(() => ({
      ok: false,
      reason: "reached_later_payout_steps",
    }));
    expect(res.reason).not.toBe("risky_sale_hold");
    expect(riskHold).toHaveBeenCalledWith("ord_1");
  });
});
