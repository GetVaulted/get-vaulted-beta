import { describe, expect, it } from "vitest";
import {
  AccountStanding,
  InstantPayoutApprovalStatus,
  InstantPayoutStatus,
  PayoutTierApprovalStatus,
  SellerFraudStatus,
  SellerLevel,
  SellerPayoutTier,
} from "@/generated/prisma/enums";
import {
  detectInstantTierSuspensions,
  evaluateNaturalPayoutTier,
  evaluateSellerPayoutTier,
  resolveEffectivePayoutTier,
  resolveInstantApprovalStatusAfterRecalc,
  type SellerPayoutMetricsData,
  type SellerTierContext,
} from "@/services/payout/seller-payout-tier";

const baseCtx: SellerTierContext = {
  id: "seller-1",
  suspendedAt: null,
  sellerSetupWizardCompletedAt: new Date(),
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  stripePayoutsEnabled: true,
  payoutTier: SellerPayoutTier.standard,
  fastPayoutStatus: PayoutTierApprovalStatus.not_eligible,
  fastPayoutOverrideByAdmin: false,
  instantPayoutApprovalStatus: InstantPayoutApprovalStatus.not_eligible,
  instantPayoutStatus: InstantPayoutStatus.ineligible,
  instantPayoutOverrideByAdmin: false,
  instantPayoutEligible: false,
  payoutTierSuspensionReason: null,
  sellerLevel: SellerLevel.vault_seller,
  sellerLevelOverrideByAdmin: false,
};

const fastMetrics: SellerPayoutMetricsData = {
  lifetimeGmvUsd: 12_000,
  completedOrders: 120,
  cancelledOrders: 1,
  accountStanding: AccountStanding.excellent,
  trackingComplianceRate: 0.95,
  cancellationRate: 0.005,
  chargebackRate: 0,
  disputeRate: 0.002,
  accountAgeDays: 45,
  fraudStatus: SellerFraudStatus.none,
  unresolvedDisputeCount: 0,
  excessiveShippingDelayCount: 0,
  dailyInstantPayoutUsd: 0,
  outstandingInstantPayoutUsd: 0,
  lifetimeInstantPayoutUsd: 0,
};

const instantMetrics: SellerPayoutMetricsData = {
  ...fastMetrics,
  lifetimeGmvUsd: 65_000,
  accountAgeDays: 120,
  cancellationRate: 0.005,
  chargebackRate: 0.005,
  disputeRate: 0.005,
};

describe("evaluateNaturalPayoutTier", () => {
  it("assigns standard tier for new sellers", () => {
    const metrics: SellerPayoutMetricsData = {
      ...fastMetrics,
      lifetimeGmvUsd: 100,
      completedOrders: 2,
      accountAgeDays: 5,
      accountStanding: AccountStanding.good,
    };
    const r = evaluateNaturalPayoutTier(metrics, baseCtx);
    expect(r.tier).toBe(SellerPayoutTier.standard);
    expect(r.fastEligible).toBe(false);
  });

  it("assigns fast tier when fast requirements met", () => {
    const r = evaluateNaturalPayoutTier(fastMetrics, baseCtx);
    expect(r.tier).toBe(SellerPayoutTier.fast);
    expect(r.fastEligible).toBe(true);
    expect(r.instantNeedsAdminApproval).toBe(false);
  });

  it("assigns fast with pending admin when instant metrics met but not approved", () => {
    const r = evaluateNaturalPayoutTier(instantMetrics, baseCtx);
    expect(r.tier).toBe(SellerPayoutTier.fast);
    expect(r.instantEligible).toBe(true);
    expect(r.instantNeedsAdminApproval).toBe(true);
  });

  it("downgrades to standard when account standing blocks fast tier", () => {
    const metrics = {
      ...instantMetrics,
      accountStanding: AccountStanding.needs_attention,
    };
    const reasons = detectInstantTierSuspensions(metrics, { fraudStatus: SellerFraudStatus.none });
    expect(reasons).toContain("account_standing_degraded");
    const r = evaluateNaturalPayoutTier(metrics, baseCtx);
    expect(r.tier).toBe(SellerPayoutTier.standard);
    expect(r.suspensionReasons.length).toBeGreaterThan(0);
  });

  it("downgrades to fast when suspended but fast requirements still met", () => {
    const metrics = { ...instantMetrics, chargebackRate: 0.02 };
    const r = evaluateNaturalPayoutTier(metrics, baseCtx);
    expect(r.tier).toBe(SellerPayoutTier.fast);
    expect(r.suspensionReasons).toContain("chargeback_rate_exceeded_1pct");
  });
});

describe("resolveInstantApprovalStatusAfterRecalc", () => {
  it("moves eligible sellers to Eligible, not Approved", () => {
    const natural = evaluateNaturalPayoutTier(instantMetrics, baseCtx);
    const status = resolveInstantApprovalStatusAfterRecalc(instantMetrics, baseCtx, natural);
    expect(status).toBe(InstantPayoutApprovalStatus.eligible);
  });

  it("preserves Under Review until admin acts", () => {
    const natural = evaluateNaturalPayoutTier(instantMetrics, baseCtx);
    const ctx: SellerTierContext = {
      ...baseCtx,
      instantPayoutApprovalStatus: InstantPayoutApprovalStatus.under_review,
    };
    const status = resolveInstantApprovalStatusAfterRecalc(instantMetrics, ctx, natural);
    expect(status).toBe(InstantPayoutApprovalStatus.under_review);
  });
});

describe("resolveEffectivePayoutTier", () => {
  it("grants instant only when approval status is approved", () => {
    const natural = evaluateNaturalPayoutTier(instantMetrics, baseCtx);
    const ctx: SellerTierContext = {
      ...baseCtx,
      instantPayoutApprovalStatus: InstantPayoutApprovalStatus.approved,
    };
    expect(resolveEffectivePayoutTier(ctx, natural)).toBe(SellerPayoutTier.instant);
  });

  it("does not grant instant when only eligible", () => {
    const natural = evaluateNaturalPayoutTier(instantMetrics, baseCtx);
    const ctx: SellerTierContext = {
      ...baseCtx,
      instantPayoutApprovalStatus: InstantPayoutApprovalStatus.eligible,
    };
    expect(resolveEffectivePayoutTier(ctx, natural)).toBe(SellerPayoutTier.fast);
  });
});

describe("evaluateSellerPayoutTier", () => {
  it("builds instant progress checklist with pending admin approval", () => {
    const eval_ = evaluateSellerPayoutTier(instantMetrics, baseCtx);
    const adminItem = eval_.checklist.find((c) => c.key === "admin_approval");
    expect(adminItem?.pending).toBe(true);
    expect(adminItem?.met).toBe(false);
    expect(eval_.instantApprovalStatus).toBe(InstantPayoutApprovalStatus.eligible);
    expect(eval_.effectiveTier).toBe(SellerPayoutTier.fast);
  });
});
