import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import { assertValidEscrowTransition } from "@/services/escrow/state-machine";

export const runtime = "nodejs";

/** Buyer: open a dispute — freezes payout release until resolved (provider-side when applicable). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: {
      id: true,
      sellerId: true,
      listingId: true,
      paymentMethod: true,
      escrowStatus: true,
      escrowProvider: true,
      escrowTransactionId: true,
    },
  });

  if (!order || order.paymentMethod !== OrderPaymentMethod.escrow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (order.escrowStatus === EscrowStatus.funds_released || order.escrowStatus === EscrowStatus.cancelled) {
    return NextResponse.json({ error: "This order cannot be disputed." }, { status: 400 });
  }

  const prev = order.escrowStatus;
  try {
    assertValidEscrowTransition(prev, EscrowStatus.disputed);
  } catch (e) {
    console.error("[orders/dispute] invalid escrow transition", order.id, e);
    return NextResponse.json({ error: "Invalid order state for dispute." }, { status: 409 });
  }
  await prisma.order.update({
    where: { id: order.id },
    data: { escrowStatus: EscrowStatus.disputed },
  });

  if (prev !== EscrowStatus.disputed) {
    await logEscrowStatusTransition({
      sellerId: order.sellerId,
      listingId: order.listingId,
      orderId: order.id,
      provider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId,
      previousStatus: prev,
      newStatus: EscrowStatus.disputed,
      source: "buyer",
    });
  }

  // TODO: Notify external payment provider dispute API when endpoint is confirmed.

  return NextResponse.json({ ok: true });
}
