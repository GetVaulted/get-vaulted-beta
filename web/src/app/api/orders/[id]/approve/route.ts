import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import { releaseEscrowFundsFromApproved } from "@/services/escrow/release-when-approved";
import { assertValidEscrowTransition, EscrowInvalidTransitionError } from "@/services/escrow/state-machine";

export const runtime = "nodejs";

const APPROVAL_RECORDED_RELEASE_FAILED =
  "Your approval was recorded, but releasing funds to the seller failed. You can retry approval or ask an admin to release funds.";

/** Buyer: record local approval first, then call the provider to release; DB reaches `funds_released` only after a valid provider outcome. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const orderSelect = {
    id: true,
    sellerId: true,
    listingId: true,
    paymentMethod: true,
    escrowTransactionId: true,
    escrowProvider: true,
    escrowStatus: true,
    paymentStatus: true,
    escrowReleasePaused: true,
    fulfillmentStatus: true,
  } as const;

  let order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: orderSelect,
  });

  if (!order || order.paymentMethod !== OrderPaymentMethod.escrow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (order.escrowReleasePaused) {
    return NextResponse.json({ error: "Release is paused for this order." }, { status: 403 });
  }

  if (order.escrowStatus === EscrowStatus.disputed) {
    return NextResponse.json({ error: "This order is disputed; release is frozen." }, { status: 409 });
  }

  if (order.escrowStatus === EscrowStatus.cancelled) {
    return NextResponse.json({ error: "This payment was cancelled." }, { status: 400 });
  }

  if (order.escrowStatus === EscrowStatus.funds_released) {
    return NextResponse.json({ error: "Funds are already released." }, { status: 400 });
  }

  const aligned = await prisma.order.updateMany({
    where: {
      id: order.id,
      buyerId: session.user.id,
      paymentMethod: OrderPaymentMethod.escrow,
      fulfillmentStatus: "delivered",
      escrowStatus: EscrowStatus.seller_shipped,
    },
    data: { escrowStatus: EscrowStatus.delivered },
  });
  if (aligned.count > 0 && order.escrowTransactionId) {
    await logEscrowStatusTransition({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      provider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId,
      previousStatus: EscrowStatus.seller_shipped,
      newStatus: EscrowStatus.delivered,
      source: "system",
    });
  }

  order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, buyerId: session.user.id },
    select: orderSelect,
  });

  const allowShippedBypass = process.env.ESCROW_ALLOW_APPROVE_FROM_SELLER_SHIPPED === "1";
  const canLocalApprove =
    order.escrowStatus === EscrowStatus.delivered ||
    order.escrowStatus === EscrowStatus.inspection_period ||
    (allowShippedBypass && order.escrowStatus === EscrowStatus.seller_shipped);
  const canRetryReleaseOnly = order.escrowStatus === EscrowStatus.approved;

  if (!canLocalApprove && !canRetryReleaseOnly) {
    return NextResponse.json(
      { error: "Delivery must be confirmed (or inspection active) before you can approve and release funds." },
      { status: 400 },
    );
  }

  if (!order.escrowTransactionId) {
    return NextResponse.json({ error: "Payment reference is missing for this order." }, { status: 400 });
  }

  if (canLocalApprove) {
    try {
      assertValidEscrowTransition(order.escrowStatus, EscrowStatus.approved, {
        allowSellerShippedRelease: allowShippedBypass,
      });
    } catch (e) {
      console.error("[orders/approve] invalid escrow transition to approved", order.id, e);
      return NextResponse.json({ error: "Invalid order state for approval." }, { status: 409 });
    }

    const fromStatuses: EscrowStatus[] = [
      EscrowStatus.delivered,
      EscrowStatus.inspection_period,
      ...(allowShippedBypass ? [EscrowStatus.seller_shipped] : []),
    ];
    const transition = await prisma.order.updateMany({
      where: {
        id: order.id,
        buyerId: session.user.id,
        escrowStatus: { in: fromStatuses },
      },
      data: { escrowStatus: EscrowStatus.approved },
    });

    if (transition.count === 0) {
      const fresh = await prisma.order.findFirst({
        where: { id: order.id, buyerId: session.user.id },
        select: { escrowStatus: true, escrowReleasePaused: true },
      });
      if (!fresh) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (fresh.escrowReleasePaused) {
        return NextResponse.json({ error: "Release is paused for this order." }, { status: 403 });
      }
      if (fresh.escrowStatus === EscrowStatus.funds_released) {
        return NextResponse.json({ error: "Funds are already released." }, { status: 400 });
      }
      if (fresh.escrowStatus === EscrowStatus.disputed) {
        return NextResponse.json({ error: "This order is disputed; release is frozen." }, { status: 409 });
      }
      if (fresh.escrowStatus === EscrowStatus.cancelled) {
        return NextResponse.json({ error: "This payment was cancelled." }, { status: 400 });
      }
      if (fresh.escrowStatus !== EscrowStatus.approved) {
        return NextResponse.json(
          { error: "Order payment state changed; refresh and try again." },
          { status: 409 },
        );
      }
    } else {
      const prevEscrow = order.escrowStatus;
      await logEscrowStatusTransition({
        sellerId: order.sellerId,
        listingId: order.listingId,
        orderId: order.id,
        provider: order.escrowProvider,
        escrowTransactionId: order.escrowTransactionId,
        previousStatus: prevEscrow,
        newStatus: EscrowStatus.approved,
        source: "buyer",
      });
    }
  }

  try {
    const { escrowStatus } = await releaseEscrowFundsFromApproved({
      order: {
        id: order.id,
        sellerId: order.sellerId,
        listingId: order.listingId,
        escrowTransactionId: order.escrowTransactionId,
        escrowProvider: order.escrowProvider,
      },
      auditSource: "buyer",
    });
    return NextResponse.json({ ok: true, escrowStatus });
  } catch (e) {
    if (e instanceof EscrowInvalidTransitionError) {
      console.error("[orders/approve] invalid post-release transition", order.id, e);
      return NextResponse.json(
        { error: "Payment processor response did not match the expected release state.", escrowStatus: EscrowStatus.approved },
        { status: 409 },
      );
    }
    console.error("[orders/approve releaseFunds]", e);
    return NextResponse.json(
      {
        error: APPROVAL_RECORDED_RELEASE_FAILED,
        approvalSucceeded: true,
        escrowStatus: EscrowStatus.approved,
      },
      { status: 502 },
    );
  }
}
