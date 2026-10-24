import { beforeEach, describe, expect, it, vi } from "vitest";

const payoutsCreate = vi.hoisted(() => vi.fn());
const balanceRetrieve = vi.hoisted(() => vi.fn());
const orderStore = vi.hoisted(() => ({ current: null as any }));
const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(async () => orderStore.current),
    findMany: vi.fn(async () => []),
    update: vi.fn(),
  },
}));

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

describe("releaseSellerStripePayout — admin seller lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to pay a locked seller, even with force, and creates no Stripe payout", async () => {
    orderStore.current = order({}, { sellerLockedAt: new Date() });
    for (const opts of [undefined, { force: true }, { planOnly: true }]) {
      const res = await releaseSellerStripePayout("ord_1", opts);
      expect(res).toEqual({ ok: false, reason: "seller_locked" });
    }
    expect(payoutsCreate).not.toHaveBeenCalled();
    expect(balanceRetrieve).not.toHaveBeenCalled();
  });

  it("leaves the order untouched so lifting the lock resumes normal payout", async () => {
    orderStore.current = order({}, { sellerLockedAt: new Date() });
    await releaseSellerStripePayout("ord_1", { force: true });
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("does not report an already-paid-out order as blocked", async () => {
    orderStore.current = order({ processorTransferId: "po_123" }, { sellerLockedAt: new Date() });
    expect(await releaseSellerStripePayout("ord_1")).toEqual({ ok: true, reason: "already_paid_out" });
  });

  it("does not interfere when the seller is not locked", async () => {
    // Unshipped + not forced: proves we got past the lock guard to the normal checks.
    orderStore.current = order({ shippedAt: null, carrierAcceptedAt: null, fulfillmentStatus: "pending", status: "paid" });
    expect(await releaseSellerStripePayout("ord_1")).toEqual({ ok: false, reason: "not_shipped" });
  });
});
