import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InstantPayoutApprovalStatus,
  OrderPaymentMethod,
  OrderPayoutStatus,
  SellerPayoutTier,
} from "@/generated/prisma/enums";

vi.mock("@/lib/payout-audit-log", () => ({ logPayoutEligibilityDecision: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/escrow/release-when-approved", () => ({
  releaseEscrowFundsFromApproved: vi.fn().mockResolvedValue({ escrowStatus: "funds_released" }),
}));
vi.mock("@/services/escrow/state-machine", () => ({
  assertValidEscrowTransition: vi.fn(),
}));
vi.mock("@/lib/escrow-audit-log", () => ({ logEscrowStatusTransition: vi.fn().mockResolvedValue(undefined) }));

const checkInstantPayoutLimits = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ allowed: true, reason: null, violatedLimit: null }),
);
const recordInstantPayoutRelease = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/payout/instant-payout-limits", () => ({
  checkInstantPayoutLimits,
  recordInstantPayoutRelease,
  reduceOutstandingInstantExposure: vi.fn().mockResolvedValue(undefined),
  logInstantPayoutLimitFallback: vi.fn().mockResolvedValue(undefined),
}));

const releaseSellerStripePayout = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/services/payout/stripe-seller-payout", () => ({
  releaseSellerStripePayout,
  orderLooksShippedForBankPayout: (o: { shippedAt?: Date | null; carrierAcceptedAt?: Date | null }) =>
    Boolean(o.shippedAt || o.carrierAcceptedAt),
  orderLabelClawbackSettledForBankPayout: () => true,
}));

const scheduleNotifyAdminsBankPayoutReady = vi.hoisted(() => vi.fn());
const loadSellerHandleForPayoutAlert = vi.hoisted(() => vi.fn().mockResolvedValue("seller1"));
vi.mock("@/lib/admin/notify-admins-bank-payout-ready", () => ({
  scheduleNotifyAdminsBankPayoutReady,
  loadSellerHandleForPayoutAlert,
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
    count: vi.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  processLabelCreatedPayoutEvaluation,
  processShippedPayoutEvaluation,
} from "@/services/payout/process-payout-tier-events";

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
    shippedAt: null,
    sellerPayoutProcessor: "STRIPE",
    processorTransferId: null,
    liveShippingSessionId: null,
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

describe("Stripe label hold vs admin bank payout queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue(baseOrder());
    prismaMock.user.findUnique.mockResolvedValue(baseSeller());
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.count.mockResolvedValue(0);
    releaseSellerStripePayout.mockResolvedValue({ ok: true });
    checkInstantPayoutLimits.mockResolvedValue({ allowed: true, reason: null, violatedLimit: null });
    loadSellerPayoutTierDashboard.mockResolvedValue({
      evaluation: {
        instantApprovalStatus: InstantPayoutApprovalStatus.approved,
        effectiveTier: SellerPayoutTier.instant,
      },
    });
  });

  it("does not bank-payout Stripe sellers at label create", async () => {
    await processLabelCreatedPayoutEvaluation("ord_1");

    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(releaseSellerStripePayout).not.toHaveBeenCalled();
    expect(scheduleNotifyAdminsBankPayoutReady).not.toHaveBeenCalled();
  });

  it("marks shipped Stripe orders ready and alerts admins (no auto bank payout)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      baseOrder({ shippedAt: new Date(), carrierAcceptedAt: new Date() }),
    );

    await processShippedPayoutEvaluation("ord_1");

    expect(releaseSellerStripePayout).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payoutStatus: OrderPayoutStatus.fast_payout_ready }),
      }),
    );
    expect(scheduleNotifyAdminsBankPayoutReady).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord_1", sellerId: "seller_1" }),
    );
  });

  it("does not re-alert when already fast_payout_ready", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      baseOrder({
        shippedAt: new Date(),
        carrierAcceptedAt: new Date(),
        payoutStatus: OrderPayoutStatus.fast_payout_ready,
      }),
    );

    await processShippedPayoutEvaluation("ord_1");

    expect(scheduleNotifyAdminsBankPayoutReady).not.toHaveBeenCalled();
  });

  it("does not re-alert for a second order joining a seller's already-alerted batch", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      baseOrder({ id: "ord_2", shippedAt: new Date(), carrierAcceptedAt: new Date() }),
    );
    // Seller already has another order sitting at fast_payout_ready — admins were already
    // alerted for this batch, so this second item should join it silently.
    prismaMock.order.count.mockResolvedValue(1);

    await processShippedPayoutEvaluation("ord_2");

    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payoutStatus: OrderPayoutStatus.fast_payout_ready }),
      }),
    );
    expect(scheduleNotifyAdminsBankPayoutReady).not.toHaveBeenCalled();
  });
});
