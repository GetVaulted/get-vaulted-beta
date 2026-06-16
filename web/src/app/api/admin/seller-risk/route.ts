import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const tier = (new URL(req.url).searchParams.get("tier") ?? "all").trim();
  const pending = (new URL(req.url).searchParams.get("pending") ?? "").trim() === "1";

  const where: Prisma.UserWhereInput = {
    sellerSetupWizardCompletedAt: { not: null },
  };

  if (tier === "standard") where.payoutTier = "standard";
  if (tier === "fast") where.payoutTier = "fast";
  if (tier === "instant") where.payoutTier = "instant";

  if (pending) {
    where.OR = [
      { fastPayoutStatus: "pending_approval" },
      { instantPayoutApprovalStatus: "under_review" },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      payoutTier: true,
      fastPayoutStatus: true,
      instantPayoutApprovalStatus: true,
      instantPayoutStatus: true,
      instantPayoutEligible: true,
      payoutTierSuspensionReason: true,
      payoutTierSuspendedAt: true,
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
      stripeVerificationStatus: true,
      sellerLevel: true,
      payoutMetrics: {
        select: {
          lifetimeGmvUsd: true,
          cancellationRate: true,
          chargebackRate: true,
          disputeRate: true,
          accountStanding: true,
          outstandingInstantPayoutUsd: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
  });

  return NextResponse.json({
    sellers: rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      payoutTier: u.payoutTier,
      fastPayoutStatus: u.fastPayoutStatus,
      instantPayoutApprovalStatus: u.instantPayoutApprovalStatus,
      instantPayoutStatus: u.instantPayoutStatus,
      instantPayoutEligible: u.instantPayoutEligible,
      suspensionReason: u.payoutTierSuspensionReason,
      suspendedAt: u.payoutTierSuspendedAt?.toISOString() ?? null,
      stripeOnboardingComplete: u.stripeOnboardingComplete,
      stripePayoutsEnabled: u.stripePayoutsEnabled,
      stripeVerificationStatus: u.stripeVerificationStatus,
      sellerLevel: u.sellerLevel,
      metrics: u.payoutMetrics
        ? {
            lifetimeGmvUsd: u.payoutMetrics.lifetimeGmvUsd,
            cancellationRate: u.payoutMetrics.cancellationRate,
            chargebackRate: u.payoutMetrics.chargebackRate,
            disputeRate: u.payoutMetrics.disputeRate,
            accountStanding: u.payoutMetrics.accountStanding,
            payoutExposureUsd: u.payoutMetrics.outstandingInstantPayoutUsd,
          }
        : null,
    })),
  });
}
