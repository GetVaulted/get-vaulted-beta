import {
  AccountStanding,
  EscrowStatus,
  InstantPayoutApprovalStatus,
  InstantPayoutStatus,
  PayoutTierApprovalStatus,
  SellerFraudStatus,
  SellerLevel,
  SellerPayoutTier,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  accountStandingLabel,
  accountStandingMeetsFast,
  accountStandingMeetsInstant,
  computeAccountStanding,
} from "@/services/payout/account-standing";
import { sellerHasVerifiedStripePayoutAccount } from "@/services/payout/instant-payout-eligibility";
import { resolveSellerLevel, sellerLevelLabel } from "@/services/payout/seller-level";
import { getCachedPayoutProgramConfig } from "@/services/payout/payout-program-settings";
import { STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS } from "@/lib/stripe-instant-payout-reference";
import { excessiveShippingDelayOrderWhere } from "@/services/payout/live-order-handling-clock";

/** @deprecated Use getCachedPayoutProgramConfig().thresholds — kept for tests and static imports. */
export const PAYOUT_TIER_THRESHOLDS = STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS.thresholds;

export const EXCESSIVE_SHIPPING_DELAY_DAYS = 7;

export type SellerPayoutMetricsData = {
  lifetimeGmvUsd: number;
  completedOrders: number;
  cancelledOrders: number;
  accountStanding: AccountStanding;
  trackingComplianceRate: number;
  cancellationRate: number;
  chargebackRate: number;
  disputeRate: number;
  accountAgeDays: number;
  fraudStatus: SellerFraudStatus;
  unresolvedDisputeCount: number;
  excessiveShippingDelayCount: number;
  dailyInstantPayoutUsd: number;
  outstandingInstantPayoutUsd: number;
  lifetimeInstantPayoutUsd: number;
};

export type SellerTierContext = {
  id: string;
  suspendedAt?: Date | null;
  createdAt?: Date;
  sellerSetupWizardCompletedAt: Date | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripePayoutsEnabled: boolean | null;
  payoutTier: SellerPayoutTier;
  fastPayoutStatus: PayoutTierApprovalStatus;
  fastPayoutOverrideByAdmin: boolean;
  instantPayoutApprovalStatus: InstantPayoutApprovalStatus;
  instantPayoutStatus: InstantPayoutStatus;
  instantPayoutOverrideByAdmin: boolean;
  instantPayoutEligible: boolean;
  payoutTierSuspensionReason: string | null;
  sellerLevel: SellerLevel;
  sellerLevelOverrideByAdmin: boolean;
};

export type PayoutTierChecklistItem = {
  key: string;
  label: string;
  met: boolean;
  pending?: boolean;
  current?: string;
  required?: string;
};

export type PayoutTierEvaluation = {
  naturalTier: SellerPayoutTier;
  effectiveTier: SellerPayoutTier;
  fastEligible: boolean;
  instantEligible: boolean;
  instantNeedsAdminApproval: boolean;
  suspensionReasons: string[];
  fastStatus: PayoutTierApprovalStatus;
  instantApprovalStatus: InstantPayoutApprovalStatus;
  sellerLevel: SellerLevel;
  sellerLevelLabel: string;
  checklist: PayoutTierChecklistItem[];
};

function accountAgeDays(createdAt: Date, now = new Date()): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

/** Aggregate lifetime seller metrics from orders and trust signals. */
export async function computeSellerPayoutMetrics(
  sellerId: string,
  sellerCreatedAt?: Date,
): Promise<SellerPayoutMetricsData> {
  const seller =
    sellerCreatedAt != null
      ? { createdAt: sellerCreatedAt }
      : await prisma.user.findUnique({
          where: { id: sellerId },
          select: { createdAt: true, suspendedAt: true },
        });
  if (!seller) {
    throw new Error("Seller not found");
  }

  const orders = await prisma.order.findMany({
    where: { sellerId },
    select: {
      paymentStatus: true,
      fulfillmentStatus: true,
      itemPriceUsd: true,
      escrowStatus: true,
      shippedAt: true,
      trackingNumber: true,
      createdAt: true,
      paymentDeadlineAt: true,
    },
  });

  const paidOrders = orders.filter((o) => o.paymentStatus === "paid");
  const recentPaid = paidOrders.filter((o) => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    return o.createdAt >= since;
  });
  const ordersWithTracking = recentPaid.filter(
    (o) => Boolean(o.trackingNumber?.trim()) || Boolean(o.shippedAt),
  ).length;
  const trackingComplianceRate =
    recentPaid.length > 0 ? ordersWithTracking / recentPaid.length : 1;

  const completedOrders = paidOrders.filter((o) => o.fulfillmentStatus === "delivered").length;
  const cancelledOrders = orders.filter(
    (o) => o.paymentStatus === "refunded" || o.paymentStatus === "cancelled",
  ).length;
  const chargebacks = orders.filter((o) => o.paymentStatus === "chargeback").length;
  const disputes = orders.filter((o) => o.escrowStatus === EscrowStatus.disputed).length;
  const totalOrderCount = Math.max(orders.length, 1);

  const lifetimeGmvUsd = paidOrders.reduce((sum, o) => sum + Math.max(0, o.itemPriceUsd), 0);
  const cancellationRate = rate(cancelledOrders, orders.length);
  const chargebackRate = rate(chargebacks, paidOrders.length || 1);
  const disputeRate = rate(disputes, paidOrders.length || 1);

  const unresolvedDisputeCount = await prisma.order.count({
    where: { sellerId, escrowStatus: EscrowStatus.disputed },
  });

  const delayCutoff = new Date();
  delayCutoff.setDate(delayCutoff.getDate() - EXCESSIVE_SHIPPING_DELAY_DAYS);
  // Live-show sales: handling clock starts when the show ends (not at purchase).
  const excessiveShippingDelayCount = await prisma.order.count({
    where: excessiveShippingDelayOrderWhere(sellerId, delayCutoff),
  });

  const openFraudReports = await prisma.report.count({
    where: {
      targetType: "user",
      targetId: sellerId,
      reason: "scam_fraud",
      status: { in: ["open", "reviewing"] },
    },
  });

  let fraudStatus: SellerFraudStatus = SellerFraudStatus.none;
  if ("suspendedAt" in seller && seller.suspendedAt) {
    fraudStatus = SellerFraudStatus.flagged;
  } else if (openFraudReports > 0) {
    fraudStatus = SellerFraudStatus.investigation;
  }

  const accountSuspended = "suspendedAt" in seller && Boolean(seller.suspendedAt);
  const accountStanding = computeAccountStanding({
    completedOrders,
    cancellationRate,
    chargebackRate,
    disputeRate,
    trackingComplianceRate,
    fraudStatus,
    unresolvedDisputeCount,
    excessiveShippingDelayCount,
    accountSuspended,
  });

  const existingMetrics = await prisma.sellerPayoutMetrics.findUnique({
    where: { sellerId },
    select: {
      dailyInstantPayoutUsd: true,
      outstandingInstantPayoutUsd: true,
      lifetimeInstantPayoutUsd: true,
    },
  });

  return {
    lifetimeGmvUsd: Math.round(lifetimeGmvUsd * 100) / 100,
    completedOrders,
    cancelledOrders,
    accountStanding,
    trackingComplianceRate,
    cancellationRate,
    chargebackRate,
    disputeRate,
    accountAgeDays: accountAgeDays(seller.createdAt),
    fraudStatus,
    unresolvedDisputeCount,
    excessiveShippingDelayCount,
    dailyInstantPayoutUsd: existingMetrics?.dailyInstantPayoutUsd ?? 0,
    outstandingInstantPayoutUsd: existingMetrics?.outstandingInstantPayoutUsd ?? 0,
    lifetimeInstantPayoutUsd: existingMetrics?.lifetimeInstantPayoutUsd ?? 0,
  };
}

export async function upsertSellerPayoutMetrics(
  sellerId: string,
  data: SellerPayoutMetricsData,
): Promise<void> {
  await prisma.sellerPayoutMetrics.upsert({
    where: { sellerId },
    create: { sellerId, ...data, lastRecalculatedAt: new Date() },
    update: { ...data, lastRecalculatedAt: new Date() },
  });
}

function sellerBaseRequirementsMet(
  ctx: SellerTierContext & { suspendedAt?: Date | null },
  fraudStatus: SellerFraudStatus,
): string[] {
  const failed: string[] = [];
  if (!ctx.sellerSetupWizardCompletedAt && !ctx.stripeOnboardingComplete) {
    failed.push("seller_onboarding_incomplete");
  }
  if (
    !sellerHasVerifiedStripePayoutAccount({
      id: ctx.id,
      suspendedAt: ctx.suspendedAt ?? null,
      sellerSetupWizardCompletedAt: ctx.sellerSetupWizardCompletedAt,
      stripeAccountId: ctx.stripeAccountId,
      stripeOnboardingComplete: ctx.stripeOnboardingComplete,
      stripePayoutsEnabled: ctx.stripePayoutsEnabled,
      shipFromStreet: null,
      shipFromCity: null,
      shipFromState: null,
      shipFromZip: null,
      shipFromCountry: null,
      defaultShipFromAddressId: null,
      instantPayoutEligible: ctx.instantPayoutEligible,
      instantPayoutStatus: ctx.instantPayoutStatus,
      instantPayoutOverrideByAdmin: ctx.instantPayoutOverrideByAdmin,
      payoutRiskLevel: "medium",
      payoutHoldDays: 7,
      payoutReservePercent: 0,
    })
  ) {
    failed.push("stripe_payout_account_not_verified");
  }
  if (ctx.suspendedAt) failed.push("account_suspended");
  if (fraudStatus !== SellerFraudStatus.none) failed.push("fraud_status_active");
  return failed;
}

function meetsFastRequirements(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
): { met: boolean; failed: string[] } {
  const failed = sellerBaseRequirementsMet(ctx, metrics.fraudStatus);
  const t = getCachedPayoutProgramConfig().thresholds.fast;
  if (metrics.accountAgeDays < t.minAccountAgeDays) failed.push("account_age_below_30_days");
  if (metrics.lifetimeGmvUsd < t.minLifetimeGmvUsd) failed.push("gmv_below_10000");
  if (metrics.completedOrders < t.minCompletedOrders) failed.push("completed_orders_below_100");
  if (!accountStandingMeetsFast(metrics.accountStanding)) {
    failed.push("account_standing_below_good");
  }
  if (metrics.unresolvedDisputeCount > 0) failed.push("unresolved_disputes");
  return { met: failed.length === 0, failed };
}

function meetsInstantRequirements(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
): { met: boolean; failed: string[] } {
  const fast = meetsFastRequirements(metrics, ctx);
  const failed = [...fast.failed];
  const t = getCachedPayoutProgramConfig().thresholds.instant;
  if (metrics.accountAgeDays < t.minAccountAgeDays) failed.push("account_age_below_90_days");
  if (metrics.lifetimeGmvUsd < t.minLifetimeGmvUsd) failed.push("gmv_below_60000");
  if (!accountStandingMeetsInstant(metrics.accountStanding)) {
    failed.push("account_standing_below_excellent");
  }
  if (metrics.cancellationRate > t.maxCancellationRate) failed.push("cancellation_rate_above_1pct");
  if (metrics.chargebackRate > t.maxChargebackRate) failed.push("chargeback_rate_above_1pct");
  if (metrics.disputeRate > t.maxDisputeRate) failed.push("dispute_rate_above_1pct");
  if (metrics.unresolvedDisputeCount > t.maxUnresolvedDisputes) failed.push("unresolved_disputes");
  if (metrics.excessiveShippingDelayCount > 0) failed.push("excessive_shipping_delays");
  return { met: failed.length === 0, failed };
}

/** Reasons that auto-suspend instant payout and downgrade tier. */
export function detectInstantTierSuspensions(
  metrics: SellerPayoutMetricsData,
  ctx: { fraudStatus: SellerFraudStatus; suspendedAt?: Date | null },
): string[] {
  const reasons: string[] = [];
  const suspensionCeiling = getCachedPayoutProgramConfig().instantSuspensionRateCeiling;
  if (
    metrics.accountStanding === AccountStanding.needs_attention ||
    metrics.accountStanding === AccountStanding.restricted
  ) {
    reasons.push("account_standing_degraded");
  }
  if (metrics.chargebackRate > suspensionCeiling) {
    reasons.push("chargeback_rate_exceeded_1pct");
  }
  if (metrics.cancellationRate > suspensionCeiling) {
    reasons.push("cancellation_rate_exceeded_1pct");
  }
  if (ctx.fraudStatus === SellerFraudStatus.investigation) {
    reasons.push("fraud_investigation_opened");
  }
  if (metrics.excessiveShippingDelayCount > 0) {
    reasons.push("excessive_shipping_delays");
  }
  if (metrics.unresolvedDisputeCount >= 2) {
    reasons.push("multiple_unresolved_buyer_disputes");
  }
  if ("suspendedAt" in ctx && ctx.suspendedAt) {
    reasons.push("account_restricted");
  }
  return reasons;
}

export function evaluateNaturalPayoutTier(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
): {
  tier: SellerPayoutTier;
  fastEligible: boolean;
  instantEligible: boolean;
  instantNeedsAdminApproval: boolean;
  suspensionReasons: string[];
} {
  const suspensionReasons = detectInstantTierSuspensions(metrics, {
    fraudStatus: metrics.fraudStatus,
    suspendedAt: ctx.suspendedAt ?? null,
  });

  const instantReq = meetsInstantRequirements(metrics, ctx);
  const fastReq = meetsFastRequirements(metrics, ctx);

  if (suspensionReasons.length > 0) {
    if (fastReq.met) {
      return {
        tier: SellerPayoutTier.fast,
        fastEligible: true,
        instantEligible: false,
        instantNeedsAdminApproval: false,
        suspensionReasons,
      };
    }
    return {
      tier: SellerPayoutTier.standard,
      fastEligible: false,
      instantEligible: false,
      instantNeedsAdminApproval: false,
      suspensionReasons,
    };
  }

  if (instantReq.met) {
    const approved = ctx.instantPayoutApprovalStatus === InstantPayoutApprovalStatus.approved;
    return {
      tier: approved ? SellerPayoutTier.instant : SellerPayoutTier.fast,
      fastEligible: true,
      instantEligible: true,
      instantNeedsAdminApproval: !approved,
      suspensionReasons: [],
    };
  }

  if (fastReq.met) {
    return {
      tier: SellerPayoutTier.fast,
      fastEligible: true,
      instantEligible: false,
      instantNeedsAdminApproval: false,
      suspensionReasons: [],
    };
  }

  return {
    tier: SellerPayoutTier.standard,
    fastEligible: false,
    instantEligible: false,
    instantNeedsAdminApproval: false,
    suspensionReasons: [],
  };
}

/** Admin overrides take precedence over automatic tier assignment. */
export function resolveEffectivePayoutTier(
  ctx: SellerTierContext,
  natural: ReturnType<typeof evaluateNaturalPayoutTier>,
): SellerPayoutTier {
  if (ctx.instantPayoutApprovalStatus === InstantPayoutApprovalStatus.approved) {
    return SellerPayoutTier.instant;
  }
  if (
    ctx.instantPayoutApprovalStatus === InstantPayoutApprovalStatus.suspended ||
    ctx.instantPayoutStatus === InstantPayoutStatus.suspended
  ) {
    return natural.fastEligible ? SellerPayoutTier.fast : SellerPayoutTier.standard;
  }
  if (ctx.fastPayoutOverrideByAdmin && ctx.fastPayoutStatus === PayoutTierApprovalStatus.approved) {
    return SellerPayoutTier.fast;
  }
  if (
    ctx.fastPayoutOverrideByAdmin &&
    ctx.fastPayoutStatus === PayoutTierApprovalStatus.denied
  ) {
    return SellerPayoutTier.standard;
  }
  return natural.tier;
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function buildInstantTierChecklist(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
): PayoutTierChecklistItem[] {
  const t = getCachedPayoutProgramConfig().thresholds.instant;
  const status = ctx.instantPayoutApprovalStatus;
  const adminApproved = status === InstantPayoutApprovalStatus.approved;

  return [
    {
      key: "account_age",
      label: `${t.minAccountAgeDays} days on platform`,
      met: metrics.accountAgeDays >= t.minAccountAgeDays,
      current: `${metrics.accountAgeDays} days`,
      required: `${t.minAccountAgeDays} days`,
    },
    {
      key: "lifetime_gmv",
      label: `${formatUsd(t.minLifetimeGmvUsd)} lifetime GMV`,
      met: metrics.lifetimeGmvUsd >= t.minLifetimeGmvUsd,
      current: formatUsd(metrics.lifetimeGmvUsd),
      required: formatUsd(t.minLifetimeGmvUsd),
    },
    {
      key: "account_standing",
      label: "Excellent account standing",
      met: accountStandingMeetsInstant(metrics.accountStanding),
      current: accountStandingLabel(metrics.accountStanding),
      required: "Excellent",
    },
    {
      key: "cancellation_rate",
      label: `Cancellation rate < ${(t.maxCancellationRate * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
      met: metrics.cancellationRate <= t.maxCancellationRate,
      current: `${(metrics.cancellationRate * 100).toFixed(2)}%`,
      required: `< ${(t.maxCancellationRate * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
    },
    {
      key: "chargeback_rate",
      label: `Chargeback rate < ${(t.maxChargebackRate * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
      met: metrics.chargebackRate <= t.maxChargebackRate,
      current: `${(metrics.chargebackRate * 100).toFixed(2)}%`,
      required: `< ${(t.maxChargebackRate * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
    },
    {
      key: "admin_approval",
      label: "Get Vaulted approval",
      met: adminApproved,
      pending:
        !adminApproved &&
        meetsInstantRequirements(metrics, ctx).met &&
        (status === InstantPayoutApprovalStatus.eligible ||
          status === InstantPayoutApprovalStatus.under_review),
      required: "Approved",
    },
  ];
}

export function buildFastTierChecklist(metrics: SellerPayoutMetricsData): PayoutTierChecklistItem[] {
  const t = getCachedPayoutProgramConfig().thresholds.fast;
  return [
    {
      key: "account_age",
      label: `${t.minAccountAgeDays} days on platform`,
      met: metrics.accountAgeDays >= t.minAccountAgeDays,
      current: `${metrics.accountAgeDays} days`,
      required: `${t.minAccountAgeDays} days`,
    },
    {
      key: "lifetime_gmv",
      label: `${formatUsd(t.minLifetimeGmvUsd)} lifetime GMV`,
      met: metrics.lifetimeGmvUsd >= t.minLifetimeGmvUsd,
      current: formatUsd(metrics.lifetimeGmvUsd),
      required: formatUsd(t.minLifetimeGmvUsd),
    },
    {
      key: "completed_orders",
      label: `${t.minCompletedOrders} completed orders`,
      met: metrics.completedOrders >= t.minCompletedOrders,
      current: String(metrics.completedOrders),
      required: String(t.minCompletedOrders),
    },
    {
      key: "account_standing",
      label: "Good or excellent account standing",
      met: accountStandingMeetsFast(metrics.accountStanding),
      current: accountStandingLabel(metrics.accountStanding),
      required: "Good+",
    },
    {
      key: "fraud_flags",
      label: "No fraud flags or restrictions",
      met: metrics.fraudStatus === SellerFraudStatus.none && metrics.unresolvedDisputeCount === 0,
      current: metrics.fraudStatus === SellerFraudStatus.none ? "Clear" : metrics.fraudStatus,
      required: "Clear",
    },
  ];
}

/** Workflow-safe instant approval status after automatic recalculation. */
export function resolveInstantApprovalStatusAfterRecalc(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
  natural: ReturnType<typeof evaluateNaturalPayoutTier>,
): InstantPayoutApprovalStatus {
  const current = ctx.instantPayoutApprovalStatus;

  if (natural.suspensionReasons.length > 0) {
    return InstantPayoutApprovalStatus.suspended;
  }

  if (current === InstantPayoutApprovalStatus.under_review) {
    return natural.instantEligible
      ? InstantPayoutApprovalStatus.under_review
      : InstantPayoutApprovalStatus.not_eligible;
  }

  if (current === InstantPayoutApprovalStatus.approved) {
    return natural.instantEligible
      ? InstantPayoutApprovalStatus.approved
      : InstantPayoutApprovalStatus.not_eligible;
  }

  if (current === InstantPayoutApprovalStatus.suspended) {
    return InstantPayoutApprovalStatus.suspended;
  }

  if (natural.instantEligible) {
    return InstantPayoutApprovalStatus.eligible;
  }

  return InstantPayoutApprovalStatus.not_eligible;
}

export function instantApprovalStatusLabel(status: InstantPayoutApprovalStatus): string {
  switch (status) {
    case InstantPayoutApprovalStatus.not_eligible:
      return "Not Eligible";
    case InstantPayoutApprovalStatus.eligible:
      return "Eligible";
    case InstantPayoutApprovalStatus.under_review:
      return "Under Review";
    case InstantPayoutApprovalStatus.approved:
      return "Approved";
    case InstantPayoutApprovalStatus.suspended:
      return "Suspended";
    default:
      return status;
  }
}

export function evaluateSellerPayoutTier(
  metrics: SellerPayoutMetricsData,
  ctx: SellerTierContext,
): PayoutTierEvaluation {
  const natural = evaluateNaturalPayoutTier(metrics, ctx);
  const instantApprovalStatus = resolveInstantApprovalStatusAfterRecalc(metrics, ctx, natural);
  const ctxWithApproval: SellerTierContext = { ...ctx, instantPayoutApprovalStatus: instantApprovalStatus };
  const effectiveTier = resolveEffectivePayoutTier(ctxWithApproval, natural);

  let fastStatus = ctx.fastPayoutStatus;
  if (ctx.fastPayoutOverrideByAdmin) {
    fastStatus = ctx.fastPayoutStatus;
  } else if (natural.fastEligible) {
    fastStatus = PayoutTierApprovalStatus.eligible;
  } else {
    fastStatus = PayoutTierApprovalStatus.not_eligible;
  }

  const sellerLevel = resolveSellerLevel({
    payoutTier: effectiveTier,
    instantPayoutApprovalStatus: instantApprovalStatus,
    sellerLevelOverrideByAdmin: ctx.sellerLevelOverrideByAdmin,
    adminSellerLevel: ctx.sellerLevel,
  });

  const checklist =
    effectiveTier === SellerPayoutTier.instant || natural.instantEligible
      ? buildInstantTierChecklist(metrics, ctxWithApproval)
      : effectiveTier === SellerPayoutTier.fast
        ? buildFastTierChecklist(metrics)
        : buildFastTierChecklist(metrics);

  return {
    naturalTier: natural.tier,
    effectiveTier,
    fastEligible: natural.fastEligible,
    instantEligible: natural.instantEligible,
    instantNeedsAdminApproval: natural.instantNeedsAdminApproval,
    suspensionReasons: natural.suspensionReasons,
    fastStatus,
    instantApprovalStatus,
    sellerLevel,
    sellerLevelLabel: sellerLevelLabel(sellerLevel),
    checklist,
  };
}

export function payoutTierLabel(tier: SellerPayoutTier): string {
  switch (tier) {
    case SellerPayoutTier.instant:
      return "Instant Payout";
    case SellerPayoutTier.fast:
      return "Fast Payout";
    default:
      return "Standard Payout";
  }
}

export function payoutTierReleaseDescription(tier: SellerPayoutTier): string {
  switch (tier) {
    case SellerPayoutTier.instant:
      return "Funds become available immediately after a valid shipping label is created.";
    case SellerPayoutTier.fast:
      return "Funds are released when tracking shows the first carrier acceptance scan.";
    default:
      return "Funds are released after delivery confirmation.";
  }
}

export function syncLegacyInstantPayoutFields(
  evaluation: PayoutTierEvaluation,
  ctx: SellerTierContext,
): Prisma.UserUpdateInput {
  const tier = evaluation.effectiveTier;
  let instantPayoutEligible = false;
  let instantPayoutStatus: InstantPayoutStatus = InstantPayoutStatus.ineligible;

  if (evaluation.instantApprovalStatus === InstantPayoutApprovalStatus.approved) {
    instantPayoutEligible = true;
    instantPayoutStatus =
      ctx.instantPayoutOverrideByAdmin && ctx.instantPayoutStatus === InstantPayoutStatus.admin_override
        ? InstantPayoutStatus.admin_override
        : InstantPayoutStatus.eligible;
  } else if (
    evaluation.suspensionReasons.length > 0 ||
    evaluation.instantApprovalStatus === InstantPayoutApprovalStatus.suspended ||
    ctx.instantPayoutStatus === InstantPayoutStatus.suspended
  ) {
    instantPayoutEligible = false;
    instantPayoutStatus = InstantPayoutStatus.suspended;
  }

  return {
    payoutTier: tier,
    fastPayoutStatus: evaluation.fastStatus,
    instantPayoutApprovalStatus: evaluation.instantApprovalStatus,
    sellerLevel: evaluation.sellerLevel,
    instantPayoutEligible,
    instantPayoutStatus,
    ...(evaluation.suspensionReasons.length > 0
      ? {
          payoutTierSuspensionReason: evaluation.suspensionReasons.join(", "),
          payoutTierSuspendedAt: new Date(),
        }
      : {}),
  };
}
