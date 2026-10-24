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

const notifyAdminsIfBreakPayoutReady = vi.hoisted(() => vi.fn().mockResolvedValue("waiting"));
vi.mock("@/lib/admin/notify-admins-bank-payout-ready", () => ({
  notifyAdminsIfBreakPayoutReady,
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

const releaseSellerPayPalPayout = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/services/payout/paypal-seller-payout", () => ({ releaseSellerPayPalPayout }));

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

describe("automatic payout release — admin seller lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ sellerPayoutProcessor: "PAYPAL" }));
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    checkInstantPayoutLimits.mockResolvedValue({ allowed: true, reason: null, violatedLimit: null });
    loadSellerPayoutTierDashboard.mockResolvedValue({
      evaluation: { instantApprovalStatus: InstantPayoutApprovalStatus.approved, effectiveTier: SellerPayoutTier.instant },
    });
    releaseSellerPayPalPayout.mockResolvedValue({ ok: true });
  });

  it("control: an unlocked PayPal seller IS released automatically at label creation", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseSeller());
    await processLabelCreatedPayoutEvaluation("ord_1");
    expect(releaseSellerPayPalPayout).toHaveBeenCalledWith("ord_1");
  });

  it("a locked PayPal seller is NOT released, and the order is not marked paid out", async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseSeller({ sellerLockedAt: new Date() }));
    await processLabelCreatedPayoutEvaluation("ord_1");
    expect(releaseSellerPayPalPayout).not.toHaveBeenCalled();
    expect(releaseSellerStripePayout).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });
});
