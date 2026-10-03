import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { accountStandingLabel } from "@/services/payout/account-standing";
import { getCachedPayoutProgramConfig, ensurePayoutProgramCache } from "@/services/payout/payout-program-settings";
import {
  loadSellerPayoutTierDashboard,
  recalculateSellerPayoutTier,
} from "@/services/payout/recalculate-seller-payout-tier";
import {
  instantApprovalStatusLabel,
  payoutTierLabel,
  payoutTierReleaseDescription,
} from "@/services/payout/seller-payout-tier";
import { SellerPayoutTier } from "@/generated/prisma/enums";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  await ensurePayoutProgramCache();
  await recalculateSellerPayoutTier(userId);
  const dashboard = await loadSellerPayoutTierDashboard(userId);
  if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { seller, metrics, evaluation } = dashboard;
  const nextTier =
    evaluation.effectiveTier === SellerPayoutTier.standard
      ? SellerPayoutTier.fast
      : evaluation.effectiveTier === SellerPayoutTier.fast
        ? SellerPayoutTier.instant
        : null;

  return NextResponse.json({
    currentTier: seller.payoutTier,
    currentTierLabel: payoutTierLabel(seller.payoutTier),
    releaseDescription: payoutTierReleaseDescription(seller.payoutTier),
    sellerLevel: seller.sellerLevel,
    sellerLevelLabel: seller.sellerLevelLabel,
    instantApprovalStatus: seller.instantPayoutApprovalStatus,
    instantApprovalLabel: instantApprovalStatusLabel(seller.instantPayoutApprovalStatus),
    nextTier: nextTier ? payoutTierLabel(nextTier) : null,
    progressChecklist: evaluation.checklist,
    metrics: {
      lifetimeGmvUsd: metrics.lifetimeGmvUsd,
      completedOrders: metrics.completedOrders,
      accountStanding: metrics.accountStanding,
      accountStandingLabel: accountStandingLabel(metrics.accountStanding),
      accountAgeDays: metrics.accountAgeDays,
      dailyInstantPayoutUsd: metrics.dailyInstantPayoutUsd,
      outstandingInstantPayoutUsd: metrics.outstandingInstantPayoutUsd,
      lifetimeInstantPayoutUsd: metrics.lifetimeInstantPayoutUsd,
    },
    platformLimits: getCachedPayoutProgramConfig().instantLimits,
    suspensionReason: seller.suspensionReason,
    rejectionReason: seller.instantPayoutRejectionReason,
    education: {
      title: "Build your reputation",
      body: "Earn Trusted Seller and Vault Verified status through consistent fulfillment, low disputes, and strong account standing. Faster payout access unlocks only after Get Vaulted review and approval — eligibility alone does not activate instant release.",
    },
  });
}
