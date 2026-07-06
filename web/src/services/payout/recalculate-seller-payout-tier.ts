import { InstantPayoutApprovalStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import {
  computeSellerPayoutMetrics,
  evaluateSellerPayoutTier,
  resolveInstantApprovalStatusAfterRecalc,
  evaluateNaturalPayoutTier,
  syncLegacyInstantPayoutFields,
  upsertSellerPayoutMetrics,
  type SellerTierContext,
} from "@/services/payout/seller-payout-tier";

const sellerTierSelect = {
  id: true,
  createdAt: true,
  suspendedAt: true,
  sellerSetupWizardCompletedAt: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripePayoutsEnabled: true,
  payoutTier: true,
  fastPayoutStatus: true,
  fastPayoutOverrideByAdmin: true,
  instantPayoutApprovalStatus: true,
  instantPayoutStatus: true,
  instantPayoutOverrideByAdmin: true,
  instantPayoutEligible: true,
  payoutTierSuspensionReason: true,
  sellerLevel: true,
  sellerLevelOverrideByAdmin: true,
} as const;

/** Recompute seller metrics and payout tier; writes audit log on tier change. */
export async function recalculateSellerPayoutTier(sellerId: string): Promise<void> {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: sellerTierSelect,
  });
  if (!seller) return;

  const metrics = await computeSellerPayoutMetrics(sellerId, seller.createdAt);
  await upsertSellerPayoutMetrics(sellerId, metrics);

  const ctx: SellerTierContext = seller;
  const natural = evaluateNaturalPayoutTier(metrics, ctx);
  const nextApproval = resolveInstantApprovalStatusAfterRecalc(metrics, ctx, natural);
  const evaluation = evaluateSellerPayoutTier(metrics, {
    ...ctx,
    instantPayoutApprovalStatus: nextApproval,
  });

  const prevTier = seller.payoutTier;
  const prevApproval = seller.instantPayoutApprovalStatus;
  const prevLevel = seller.sellerLevel;
  const update = syncLegacyInstantPayoutFields(evaluation, ctx);

  const approvalChanged = prevApproval !== nextApproval;
  const tierChanged = prevTier !== evaluation.effectiveTier;
  const levelChanged = prevLevel !== evaluation.sellerLevel;

  await prisma.user.update({
    where: { id: sellerId },
    data: {
      ...update,
      instantPayoutApprovalStatus: nextApproval,
      sellerLevel: evaluation.sellerLevel,
      ...(evaluation.suspensionReasons.length === 0
        ? { payoutTierSuspensionReason: null, payoutTierSuspendedAt: null }
        : {
            payoutTierSuspensionReason: evaluation.suspensionReasons.join(", "),
            payoutTierSuspendedAt: new Date(),
          }),
    },
  });

  if (tierChanged) {
    await logPayoutEligibilityDecision({
      sellerId,
      action: "seller_payout_tier_recalculated",
      previousStatus: prevTier,
      newStatus: evaluation.effectiveTier,
      reason:
        evaluation.suspensionReasons.join(", ") ||
        `natural=${evaluation.naturalTier} effective=${evaluation.effectiveTier}`,
    });
  }

  if (approvalChanged && nextApproval === InstantPayoutApprovalStatus.eligible) {
    await logPayoutEligibilityDecision({
      sellerId,
      action: "seller_instant_payout_eligible",
      previousStatus: prevApproval,
      newStatus: nextApproval,
      reason: "automatic_eligibility_recalc",
    });
  }

  if (levelChanged) {
    await logPayoutEligibilityDecision({
      sellerId,
      action: "seller_level_changed",
      previousStatus: prevLevel,
      newStatus: evaluation.sellerLevel,
      reason: `tier=${evaluation.effectiveTier} approval=${nextApproval}`,
    });
  }
}

/**
 * Sellers per concurrent batch when recalculating payout tiers. Each seller recalculation does
 * ~7-9 sequential DB round trips (see `computeSellerPayoutMetrics`); running one seller at a
 * time serialized the whole cron and made it prone to exceeding the function execution limit
 * as the seller count grew (performance audit 2026-07). This does not change what's computed
 * per seller — only how many sellers are processed concurrently.
 */
const PAYOUT_TIER_RECALC_CONCURRENCY = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Daily cron: recalculate tiers for sellers with at least one paid order. */
export async function recalculateAllSellerPayoutTiers(): Promise<{
  candidates: number;
  processed: number;
  failed: number;
}> {
  const sellers = await prisma.order.findMany({
    where: { paymentStatus: "paid" },
    select: { sellerId: true },
    distinct: ["sellerId"],
  });

  let processed = 0;
  let failed = 0;
  for (const batch of chunk(sellers, PAYOUT_TIER_RECALC_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map(({ sellerId }) => recalculateSellerPayoutTier(sellerId)),
    );
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (result.status === "fulfilled") {
        processed += 1;
      } else {
        failed += 1;
        console.error("[recalculateAllSellerPayoutTiers]", batch[i]?.sellerId, result.reason);
      }
    }
  }
  return { candidates: sellers.length, processed, failed };
}

export async function loadSellerPayoutTierDashboard(sellerId: string) {
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      ...sellerTierSelect,
      payoutTierSuspensionReason: true,
      payoutTierSuspendedAt: true,
      fastPayoutOverrideReason: true,
      instantPayoutOverrideReason: true,
      instantPayoutReviewDate: true,
      instantPayoutReviewedById: true,
      instantPayoutReviewNotes: true,
      instantPayoutRejectionReason: true,
      instantPayoutPerOrderLimitUsd: true,
      instantPayoutDailyLimitUsd: true,
      instantPayoutExposureLimitUsd: true,
      payoutMetrics: true,
    },
  });
  if (!seller) return null;

  const metrics =
    seller.payoutMetrics != null
      ? {
          lifetimeGmvUsd: seller.payoutMetrics.lifetimeGmvUsd,
          completedOrders: seller.payoutMetrics.completedOrders,
          cancelledOrders: seller.payoutMetrics.cancelledOrders,
          accountStanding: seller.payoutMetrics.accountStanding,
          trackingComplianceRate: seller.payoutMetrics.trackingComplianceRate,
          cancellationRate: seller.payoutMetrics.cancellationRate,
          chargebackRate: seller.payoutMetrics.chargebackRate,
          disputeRate: seller.payoutMetrics.disputeRate,
          accountAgeDays: seller.payoutMetrics.accountAgeDays,
          fraudStatus: seller.payoutMetrics.fraudStatus,
          unresolvedDisputeCount: seller.payoutMetrics.unresolvedDisputeCount,
          excessiveShippingDelayCount: seller.payoutMetrics.excessiveShippingDelayCount,
          dailyInstantPayoutUsd: seller.payoutMetrics.dailyInstantPayoutUsd,
          outstandingInstantPayoutUsd: seller.payoutMetrics.outstandingInstantPayoutUsd,
          lifetimeInstantPayoutUsd: seller.payoutMetrics.lifetimeInstantPayoutUsd,
        }
      : await computeSellerPayoutMetrics(sellerId, seller.createdAt);

  const evaluation = evaluateSellerPayoutTier(metrics, seller);

  return {
    seller: {
      id: seller.id,
      payoutTier: evaluation.effectiveTier,
      sellerLevel: evaluation.sellerLevel,
      sellerLevelLabel: evaluation.sellerLevelLabel,
      fastPayoutStatus: evaluation.fastStatus,
      instantPayoutApprovalStatus: evaluation.instantApprovalStatus,
      instantPayoutReviewDate: seller.instantPayoutReviewDate?.toISOString() ?? null,
      instantPayoutReviewNotes: seller.instantPayoutReviewNotes,
      instantPayoutRejectionReason: seller.instantPayoutRejectionReason,
      suspensionReason: seller.payoutTierSuspensionReason,
      suspendedAt: seller.payoutTierSuspendedAt?.toISOString() ?? null,
      limitOverrides: {
        perOrderUsd: seller.instantPayoutPerOrderLimitUsd,
        dailyUsd: seller.instantPayoutDailyLimitUsd,
        exposureUsd: seller.instantPayoutExposureLimitUsd,
      },
    },
    metrics,
    evaluation,
  };
}
