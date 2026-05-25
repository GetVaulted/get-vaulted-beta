import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod, OrderPayoutStatus } from "@/generated/prisma/enums";
import { logPayoutEligibilityDecision } from "@/lib/payout-audit-log";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { releaseEscrowFundsFromApproved } from "@/services/escrow/release-when-approved";
import { assertValidEscrowTransition, EscrowInvalidTransitionError } from "@/services/escrow/state-machine";
import { processDeliveryPayoutEvaluation } from "@/services/payout/process-delivery-payout";

export const runtime = "nodejs";

type Body = {
  action?: string;
  reason?: string;
};

/** Admin order-level payout controls: release, block, manual review. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json({ error: "Reason is required for payout actions." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      listingId: true,
      paymentStatus: true,
      paymentMethod: true,
      fulfillmentStatus: true,
      payoutStatus: true,
      escrowStatus: true,
      escrowTransactionId: true,
      escrowProvider: true,
      escrowReleasePaused: true,
      fundsReleasedAt: true,
      deliveryConfirmedAt: true,
      seller: {
        select: {
          stripeAccountId: true,
          stripeOnboardingComplete: true,
          stripePayoutsEnabled: true,
        },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prevStatus = order.payoutStatus;
  const now = new Date();

  if (action === "release_payout") {
    if (order.paymentStatus !== "paid") {
      return NextResponse.json({ error: "Order is not paid." }, { status: 400 });
    }
    if (!order.seller.stripeAccountId || !order.seller.stripeOnboardingComplete) {
      return NextResponse.json(
        { error: "Cannot release payout — seller has no verified Stripe payout account." },
        { status: 400 },
      );
    }
    if (order.fulfillmentStatus !== "delivered" && !order.deliveryConfirmedAt) {
      return NextResponse.json(
        { error: "Delivery must be confirmed before releasing payout." },
        { status: 400 },
      );
    }

    if (order.paymentMethod === OrderPaymentMethod.escrow) {
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction on order." }, { status: 400 });
      }
      if (order.escrowReleasePaused) {
        await prisma.order.update({
          where: { id: orderId },
          data: { escrowReleasePaused: false },
        });
      }
      let escrowStatus = order.escrowStatus;
      if (escrowStatus !== EscrowStatus.approved && escrowStatus !== EscrowStatus.funds_released) {
        if (
          escrowStatus === EscrowStatus.delivered ||
          escrowStatus === EscrowStatus.inspection_period ||
          escrowStatus === EscrowStatus.seller_shipped
        ) {
          try {
            assertValidEscrowTransition(escrowStatus, EscrowStatus.approved);
            await prisma.order.update({
              where: { id: orderId },
              data: { escrowStatus: EscrowStatus.approved },
            });
            escrowStatus = EscrowStatus.approved;
          } catch {
            return NextResponse.json({ error: "Invalid escrow state for release." }, { status: 409 });
          }
        }
      }
      if (escrowStatus === EscrowStatus.approved) {
        try {
          await releaseEscrowFundsFromApproved({
            order: {
              id: order.id,
              sellerId: order.sellerId,
              listingId: order.listingId,
              escrowTransactionId: order.escrowTransactionId,
              escrowProvider: order.escrowProvider,
            },
            auditSource: "admin",
          });
        } catch (e) {
          if (e instanceof EscrowInvalidTransitionError) {
            return NextResponse.json({ error: "Escrow release failed." }, { status: 502 });
          }
          throw e;
        }
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.paid_out,
        payoutReleasedAt: now,
        payoutBlockedReason: null,
        ...(order.fundsReleasedAt ? {} : { fundsReleasedAt: now }),
      },
    });

    await logPayoutEligibilityDecision({
      sellerId: order.sellerId,
      orderId,
      adminId: gate.userId,
      action: "order_payout_released",
      previousStatus: prevStatus,
      newStatus: OrderPayoutStatus.paid_out,
      reason,
    });

    return NextResponse.json({ ok: true, payoutStatus: OrderPayoutStatus.paid_out });
  }

  if (action === "block_payout") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.blocked,
        payoutBlockedReason: reason,
      },
    });

    await logPayoutEligibilityDecision({
      sellerId: order.sellerId,
      orderId,
      adminId: gate.userId,
      action: "order_payout_blocked",
      previousStatus: prevStatus,
      newStatus: OrderPayoutStatus.blocked,
      reason,
    });

    return NextResponse.json({ ok: true, payoutStatus: OrderPayoutStatus.blocked });
  }

  if (action === "manual_review") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        payoutStatus: OrderPayoutStatus.manual_review,
        payoutBlockedReason: reason,
      },
    });

    await logPayoutEligibilityDecision({
      sellerId: order.sellerId,
      orderId,
      adminId: gate.userId,
      action: "order_manual_review",
      previousStatus: prevStatus,
      newStatus: OrderPayoutStatus.manual_review,
      reason,
    });

    return NextResponse.json({ ok: true, payoutStatus: OrderPayoutStatus.manual_review });
  }

  if (action === "reevaluate") {
    await processDeliveryPayoutEvaluation(orderId);
    const fresh = await prisma.order.findUnique({
      where: { id: orderId },
      select: { payoutStatus: true },
    });
    return NextResponse.json({ ok: true, payoutStatus: fresh?.payoutStatus });
  }

  return NextResponse.json(
    { error: "Invalid action. Use release_payout, block_payout, manual_review, or reevaluate." },
    { status: 400 },
  );
}
