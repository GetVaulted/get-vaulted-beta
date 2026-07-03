import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstantPayoutApprovalStatus, OrderPaymentMethod, OrderPayoutStatus, SellerPayoutTier } from "@/generated/prisma/enums";

vi.mock("@/lib/payout-audit-log", () => ({ logPayoutEligibilityDecision: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/escrow/release-when-approved", () => ({
  releaseEscrowFundsFromApproved: vi.fn().mockResolvedValue({ escrowStatus: "funds_released" }),
}));
vi.mock("@/services/escrow/state-machine", () => ({
  assertValidEscrowTransition: vi.fn(),
}));
vi.mock("@/lib/escrow-audit-log", () => ({ logEscrowStatusTransition: vi.fn().mockResolvedValue(undefined) }));

const checkInstantPayoutLimits = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true, reason: null, violatedLimit: null }));
const recordInstantPayoutRelease = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/payout/instant-payout-limits", () => ({
  checkInstantPayoutLimits,
  recordInstantPayoutRelease,
  reduceOutstandingInstantExposure: vi.fn().mockResolvedValue(undefined),
  logInstantPayoutLimitFallback: vi.fn().mockResolvedValue(undefined),
}));

const loadSellerPayoutTierDashboard = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    evaluation: {
      instantApprovalStatus: "approved",
      effectiveTier: "instant",
    },
  }),
);
const recalculateSellerPayoutTier = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/payout/recalculate-seller-payout-tier", () => ({
  loadSellerPayoutTierDashboard,
  recalculateSellerPayoutTier,
}));

const prismaMock = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { processLabelCreatedPayoutEvaluation } from "@/services/payout/process-payout-tier-events";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    sellerId: "seller_1",
    listingId: "lst_1",
    paymentStatus: "paid",
    paymentMethod: OrderPaymentMethod.stripe,
    fulfillmentStatus: "shipped",
    escrowStatus: null,
    escrowReleasePaused: false,
    escrowTransactionId: null,
    escrowProvider: null,
    trackingNumber: "1Z999",
    shippingStatus: "in_transit",
    shippoTransactionId: "shippo_1",
    labelUrl: "https://labels.test/1",
    itemPriceUsd: 100,
    shippingPriceUsd: 0,
    totalUsd: 110,
    payoutStatus: OrderPayoutStatus.held,
    payoutMethod: "standard",
    payoutBlockedReason: null,
    payoutReserveAmountCents: 0,
    deliveryConfirmedAt: null,
    payoutReleasedAt: null,
    fundsReleasedAt: null,
    labelCreatedAt: null,
    carrierAcceptedAt: null,
    listing: { isCompanyListing: false },
    liveShippingSession: null,
    ...overrides,
  };
}

function baseSeller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    suspendedAt: null,
    sellerSetupWizardCompletedAt: new Date(),
    stripeAccountId: "acct_1",
    stripeOnboardingComplete: true,
    stripePayoutsEnabled: true,
    shipFromStreet: "1 Main St",
    shipFromCity: "Austin",
    shipFromState: "TX",
    shipFromZip: "78701",
    shipFromCountry: "US",
    defaultShipFromAddressId: "addr_1",
    instantPayoutEligible: true,
    instantPayoutStatus: "eligible",
    instantPayoutOverrideByAdmin: false,
    payoutRiskLevel: "standard",
    payoutHoldDays: 0,
    payoutReservePercent: 0,
    payoutTier: "instant",
    ...overrides,
  };
}

describe("finalizeOrderPayoutRelease atomic claim (via processLabelCreatedPayoutEvaluation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue(baseOrder());
    prismaMock.user.findUnique.mockResolvedValue(baseSeller());
    prismaMock.order.findMany.mockResolvedValue([]);
    checkInstantPayoutLimits.mockResolvedValue({ allowed: true, reason: null, violatedLimit: null });
    loadSellerPayoutTierDashboard.mockResolvedValue({
      evaluation: {
        instantApprovalStatus: InstantPayoutApprovalStatus.approved,
        effectiveTier: SellerPayoutTier.instant,
      },
    });
  });

  it("flips payoutStatus to paid_out guarded on payoutStatus not already paid_out", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    await processLabelCreatedPayoutEvaluation("ord_1");

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", payoutStatus: { not: OrderPayoutStatus.paid_out } },
        data: expect.objectContaining({ payoutStatus: OrderPayoutStatus.paid_out }),
      }),
    );
    expect(recordInstantPayoutRelease).toHaveBeenCalledTimes(1);
    expect(recalculateSellerPayoutTier).toHaveBeenCalledTimes(1);
  });

  it("skips one-time side effects when the atomic claim loses the race (already paid out)", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });

    await processLabelCreatedPayoutEvaluation("ord_1");

    expect(prismaMock.order.updateMany).toHaveBeenCalledTimes(1);
    expect(recordInstantPayoutRelease).not.toHaveBeenCalled();
    expect(recalculateSellerPayoutTier).not.toHaveBeenCalled();
  });
});

describe("instant payout limits/exposure use seller net, not raw item price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(baseSeller());
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    checkInstantPayoutLimits.mockResolvedValue({ allowed: true, reason: null, violatedLimit: null });
    loadSellerPayoutTierDashboard.mockResolvedValue({
      evaluation: {
        instantApprovalStatus: InstantPayoutApprovalStatus.approved,
        effectiveTier: SellerPayoutTier.instant,
      },
    });
  });

  it("checks and records the fee-adjusted, shipping-inclusive seller net (not itemPriceUsd) for a marketplace order", async () => {
    // item $100, 8% marketplace fee => $8 fee, plus $15 shipping pass-through => net $107.
    prismaMock.order.findUnique.mockResolvedValue(
      baseOrder({ itemPriceUsd: 100, shippingPriceUsd: 15 }),
    );

    await processLabelCreatedPayoutEvaluation("ord_1");

    expect(checkInstantPayoutLimits).toHaveBeenCalledWith("seller_1", 107);
    expect(recordInstantPayoutRelease).toHaveBeenCalledWith("seller_1", "ord_1", 107);
  });

  it("falls back (does not release) when the seller-net amount exceeds the instant limit, even if raw item price would have passed", async () => {
    // item $100 + $15 shipping - 8% fee = net $107. Simulate a limit check keyed to net, not item price.
    prismaMock.order.findUnique.mockResolvedValue(
      baseOrder({ itemPriceUsd: 100, shippingPriceUsd: 15 }),
    );
    checkInstantPayoutLimits.mockImplementation(async (_sellerId: string, amountUsd: number) => ({
      allowed: amountUsd <= 105,
      reason: amountUsd <= 105 ? null : "over limit",
      violatedLimit: amountUsd <= 105 ? null : ("per_order" as const),
    }));

    await processLabelCreatedPayoutEvaluation("ord_1");

    expect(checkInstantPayoutLimits).toHaveBeenCalledWith("seller_1", 107);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(recordInstantPayoutRelease).not.toHaveBeenCalled();
  });
});
