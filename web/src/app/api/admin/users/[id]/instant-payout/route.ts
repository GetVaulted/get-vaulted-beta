import { NextResponse } from "next/server";
import { InstantPayoutStatus, OrderPayoutStatus } from "@/generated/prisma/enums";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { sellerHasVerifiedStripePayoutAccount } from "@/services/payout/instant-payout-eligibility";
import { loadSellerPayoutSummaryForAdmin, processDeliveryPayoutEvaluation } from "@/services/payout/process-delivery-payout";

export const runtime = "nodejs";

type Body = {
  action?: string;
  reason?: string;
};

const VALID_ACTIONS = [
  "enable_instant_payout",
  "disable_instant_payout",
  "suspend_instant_payout",
  "require_manual_review",
] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const sellerId = decodeURIComponent(raw);
  const summary = await loadSellerPayoutSummaryForAdmin(sellerId);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auditLogs = await prisma.payoutEligibilityAuditLog.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: 20,
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

  return NextResponse.json({
    ...summary,
    auditLogs: auditLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}

/** Admin override controls for seller instant payout eligibility. */
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
  if (!reason) {
    return NextResponse.json({ error: "Reason is required for payout overrides." }, { status: 400 });
  }

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      instantPayoutStatus: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
    },
  });
  if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prevStatus = seller.instantPayoutStatus;
  const now = new Date();

  if (action === "enable_instant_payout") {
    if (
      !sellerHasVerifiedStripePayoutAccount({
        id: seller.id,
        suspendedAt: null,
        sellerSetupWizardCompletedAt: now,
        stripeAccountId: seller.stripeAccountId,
        stripeOnboardingComplete: seller.stripeOnboardingComplete,
        stripePayoutsEnabled: seller.stripePayoutsEnabled,
        shipFromStreet: null,
        shipFromCity: null,
        shipFromState: null,
        shipFromZip: null,
        shipFromCountry: null,
        defaultShipFromAddressId: null,
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.ineligible,
        instantPayoutOverrideByAdmin: false,
        payoutRiskLevel: "medium",
        payoutHoldDays: 7,
        payoutReservePercent: 0,
      })
    ) {
      return NextResponse.json(
        { error: "Cannot enable instant payout without a verified Stripe payout account." },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutEligible: true,
        instantPayoutStatus: InstantPayoutStatus.admin_override,
        instantPayoutOverrideByAdmin: true,
        instantPayoutOverrideReason: reason,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
      },
    });

    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_enabled",
      previousStatus: prevStatus,
      newStatus: InstantPayoutStatus.admin_override,
      reason,
    });

    const delivered = await prisma.order.findMany({
      where: {
        sellerId,
        paymentStatus: "paid",
        fulfillmentStatus: "delivered",
        payoutStatus: { not: OrderPayoutStatus.paid_out },
      },
      select: { id: true },
    });
    for (const o of delivered) {
      await processDeliveryPayoutEvaluation(o.id);
    }
  }

  if (action === "disable_instant_payout") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.ineligible,
        instantPayoutOverrideByAdmin: true,
        instantPayoutOverrideReason: reason,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
      },
    });

    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_disabled",
      previousStatus: prevStatus,
      newStatus: InstantPayoutStatus.ineligible,
      reason,
    });
  }

  if (action === "suspend_instant_payout") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.suspended,
        instantPayoutOverrideByAdmin: true,
        instantPayoutOverrideReason: reason,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
      },
    });

    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_instant_payout_suspended",
      previousStatus: prevStatus,
      newStatus: InstantPayoutStatus.suspended,
      reason,
    });
  }

  if (action === "require_manual_review") {
    await prisma.user.update({
      where: { id: sellerId },
      data: {
        instantPayoutEligible: false,
        instantPayoutStatus: InstantPayoutStatus.ineligible,
        instantPayoutOverrideByAdmin: true,
        instantPayoutOverrideReason: reason,
        instantPayoutOverrideAdminId: gate.userId,
        instantPayoutOverrideAt: now,
      },
    });

    const pendingOrders = await prisma.order.findMany({
      where: {
        sellerId,
        paymentStatus: "paid",
        payoutStatus: { notIn: [OrderPayoutStatus.paid_out, OrderPayoutStatus.blocked] },
      },
      select: { id: true, payoutStatus: true },
    });

    for (const o of pendingOrders) {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          payoutStatus: OrderPayoutStatus.manual_review,
          payoutBlockedReason: reason,
        },
      });
      await logPayoutEligibilityDecision({
        sellerId,
        orderId: o.id,
        adminId: gate.userId,
        action: "order_manual_review",
        previousStatus: o.payoutStatus,
        newStatus: OrderPayoutStatus.manual_review,
        reason,
      });
    }

    await logPayoutEligibilityDecision({
      sellerId,
      adminId: gate.userId,
      action: "seller_manual_review_required",
      previousStatus: prevStatus,
      newStatus: InstantPayoutStatus.ineligible,
      reason,
    });
  }

  return NextResponse.json({ ok: true });
}
