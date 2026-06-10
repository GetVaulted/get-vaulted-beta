import { NextResponse } from "next/server";
import {
  InstantPayoutApprovalStatus,
  InstantPayoutStatus,
  PayoutTierApprovalStatus,
  SellerLevel,
  SellerPayoutTier,
} from "@/generated/prisma/enums";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { DEFAULT_INSTANT_PAYOUT_LIMITS } from "@/services/payout/instant-payout-limits";
import { loadSellerPayoutSummaryForAdmin } from "@/services/payout/process-delivery-payout";
import {
  loadSellerPayoutTierDashboard,
  recalculateSellerPayoutTier,
} from "@/services/payout/recalculate-seller-payout-tier";
import { instantApprovalStatusLabel } from "@/services/payout/seller-payout-tier";

export const runtime = "nodejs";

type Body = {
  action?: string;
  reason?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  overrideRequirements?: boolean;
  perOrderLimitUsd?: number;
  dailyLimitUsd?: number;
  exposureLimitUsd?: number;
};

const VALID_ACTIONS = [
  "start_instant_review",
  "approve_instant_payout",
  "reject_instant_payout",
  "suspend_instant_payout",
  "restore_instant_payout",
  "grant_fast_payout",
  "remove_fast_payout",
  "revoke_instant_payout",
  "assign_elite_vault_verified",
  "remove_elite_vault_verified",
  "override_instant_limits",
  "restore_seller_status",
  "recalculate",
] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const sellerId = decodeURIComponent(raw);

  const summary = await loadSellerPayoutSummaryForAdmin(sellerId);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dashboard = await loadSellerPayoutTierDashboard(sellerId);

  const auditLogs = await prisma.payoutEligibilityAuditLog.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      orderId: true,
      adminId: true,
      action: true,
      previousStatus: true,
      newStatus: true,
      reason: true,
      createdAt: true,
    },
  });

  const suspensionHistory = auditLogs.filter(
    (l) =>
      l.action.includes("suspend") ||
      l.action.includes("rejected") ||
      l.action === "seller_payout_tier_recalculated",
  );

  return NextResponse.json({
    seller: {
      ...summary.seller,
      payoutTier: dashboard?.seller.payoutTier ?? summary.seller.payoutTier ?? "standard",
      sellerLevel: dashboard?.seller.sellerLevel ?? "vault_seller",
      sellerLevelLabel: dashboard?.seller.sellerLevelLabel ?? "Vault Seller",
      fastPayoutStatus: dashboard?.seller.fastPayoutStatus ?? "not_eligible",
      instantPayoutApprovalStatus: dashboard?.seller.instantPayoutApprovalStatus ?? "not_eligible",
      instantPayoutApprovalLabel: dashboard
        ? instantApprovalStatusLabel(dashboard.seller.instantPayoutApprovalStatus)
        : "Not Eligible",
      instantPayoutReviewDate: dashboard?.seller.instantPayoutReviewDate ?? null,
      instantPayoutReviewNotes: dashboard?.seller.instantPayoutReviewNotes ?? null,
      instantPayoutRejectionReason: dashboard?.seller.instantPayoutRejectionReason ?? null,
      suspensionReason: dashboard?.seller.suspensionReason ?? null,
      limitOverrides: dashboard?.seller.limitOverrides ?? null,
      platformLimits: DEFAULT_INSTANT_PAYOUT_LIMITS,
    },
    metrics: dashboard?.metrics ?? summary.metrics ?? null,
    tierEvaluation: dashboard?.evaluation ?? summary.tierEvaluation ?? null,
    suspensionHistory: suspensionHistory.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    })),
    auditLogs: auditLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}

/** Admin risk management controls for seller payout tiers and instant approval workflow. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const sellerId = decodeURIComponent(raw);

  if (sellerId === gate.userId) {
    return NextResponse.json({ error: "You cannot change your own account here." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!VALID_ACTIONS.includes(action as (typeof VALID_ACTIONS)[number])) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (!reason && action !== "recalculate") {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      payoutTier: true,
      fastPayoutStatus: true,
      instantPayoutApprovalStatus: true,
      sellerLevel: true,
    },
  });
  if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const prevApproval = seller.instantPayoutApprovalStatus;
  const prevLevel = seller.sellerLevel;

  if (action === "recalculate") {
    await recalculateSellerPayoutTier(sellerId);
    return NextResponse.json({ ok: true });
  }

  if (action === "start_instant_review") {
    if (seller.instantPayoutApprovalStatus !== InstantPayoutApprovalStatus.eligible) {
      return NextResponse.json({ error: "Seller must be Eligible before starting review." }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutApprovalStatus: InstantPayoutApprovalStatus.under_review,
        instantPayoutReviewDate: now,
        instantPayoutReviewedById: gate.userId,
        instantPayoutReviewNotes: body.reviewNotes?.trim() || reason,
        instantPayoutRejectionReason: null,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_under_review",
      previousStatus: prevApproval,
      newStatus: InstantPayoutApprovalStatus.under_review,
      reason,
    });
  }

  if (action === "approve_instant_payout") {
    const notes = body.reviewNotes?.trim() || reason;
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutApprovalStatus: InstantPayoutApprovalStatus.approved,
        instantPayoutReviewDate: now,
        instantPayoutReviewedById: gate.userId,
        instantPayoutReviewNotes: notes,
        instantPayoutRejectionReason: null,
        instantPayoutEligible: true,
        instantPayoutStatus: InstantPayoutStatus.admin_override,
        instantPayoutOverrideByAdmin: true,
        instantPayoutOverrideReason: notes,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
        payoutTier: SellerPayoutTier.instant,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_approved",
      previousStatus: prevApproval,
      newStatus: InstantPayoutApprovalStatus.approved,
      reason: body.overrideRequirements ? `${notes} (requirements overridden)` : notes,
    });
  }

  if (action === "reject_instant_payout") {
    const rejection = body.rejectionReason?.trim() || reason;
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutApprovalStatus: InstantPayoutApprovalStatus.not_eligible,
        instantPayoutRejectionReason: rejection,
        instantPayoutReviewDate: now,
        instantPayoutReviewedById: gate.userId,
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.ineligible,
        payoutTier: SellerPayoutTier.fast,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_rejected",
      previousStatus: prevApproval,
      newStatus: InstantPayoutApprovalStatus.not_eligible,
      reason: rejection,
    });
  }

  if (action === "suspend_instant_payout" || action === "revoke_instant_payout") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutApprovalStatus: InstantPayoutApprovalStatus.suspended,
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.suspended,
        instantPayoutOverrideReason: reason,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
        payoutTier: SellerPayoutTier.fast,
        payoutTierSuspensionReason: reason,
        payoutTierSuspendedAt: now,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_suspended",
      previousStatus: prevApproval,
      newStatus: InstantPayoutApprovalStatus.suspended,
      reason,
    });
  }

  if (action === "restore_instant_payout" || action === "restore_seller_status") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutApprovalStatus: InstantPayoutApprovalStatus.eligible,
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.ineligible,
        payoutTierSuspensionReason: null,
        payoutTierSuspendedAt: null,
        instantPayoutRejectionReason: null,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_restored",
      previousStatus: prevApproval,
      newStatus: InstantPayoutApprovalStatus.eligible,
      reason,
    });
  }

  if (action === "grant_fast_payout") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        fastPayoutOverrideByAdmin: true,
        fastPayoutOverrideReason: reason,
        fastPayoutOverrideAdminId: gate.userId,
        fastPayoutOverrideAt: now,
        fastPayoutStatus: PayoutTierApprovalStatus.approved,
        payoutTier: SellerPayoutTier.fast,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_fast_payout_granted",
      previousStatus: seller.payoutTier,
      newStatus: SellerPayoutTier.fast,
      reason,
    });
  }

  if (action === "remove_fast_payout") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        fastPayoutOverrideByAdmin: true,
        fastPayoutOverrideReason: reason,
        fastPayoutOverrideAdminId: gate.userId,
        fastPayoutOverrideAt: now,
        fastPayoutStatus: PayoutTierApprovalStatus.denied,
        payoutTier: SellerPayoutTier.standard,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_fast_payout_removed",
      previousStatus: seller.payoutTier,
      newStatus: SellerPayoutTier.standard,
      reason,
    });
  }

  if (action === "assign_elite_vault_verified") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        sellerLevel: SellerLevel.elite_vault_verified,
        sellerLevelOverrideByAdmin: true,
        sellerLevelOverrideAdminId: gate.userId,
        sellerLevelOverrideAt: now,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_elite_vault_verified_assigned",
      previousStatus: prevLevel,
      newStatus: SellerLevel.elite_vault_verified,
      reason,
    });
  }

  if (action === "remove_elite_vault_verified") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        sellerLevelOverrideByAdmin: false,
        sellerLevelOverrideAdminId: gate.userId,
        sellerLevelOverrideAt: now,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_elite_vault_verified_removed",
      previousStatus: prevLevel,
      newStatus: "recalculate",
      reason,
    });
  }

  if (action === "override_instant_limits") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutPerOrderLimitUsd:
          typeof body.perOrderLimitUsd === "number" ? body.perOrderLimitUsd : undefined,
        instantPayoutDailyLimitUsd:
          typeof body.dailyLimitUsd === "number" ? body.dailyLimitUsd : undefined,
        instantPayoutExposureLimitUsd:
          typeof body.exposureLimitUsd === "number" ? body.exposureLimitUsd : undefined,
      },
    });
    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_limit_override",
      previousStatus: null,
      newStatus: JSON.stringify({
        perOrder: body.perOrderLimitUsd,
        daily: body.dailyLimitUsd,
        exposure: body.exposureLimitUsd,
      }),
      reason,
    });
  }

  await recalculateSellerPayoutTier(sellerId);
  return NextResponse.json({ ok: true });
}
