import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { createNotification } from "@/lib/notifications";
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
      listing: { select: { title: true } },
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

    // FIX: opening a dispute previously only updated the DB/audit log — the seller had no
    // in-app/push signal that anything happened. Gated on the same "this is a real transition"
    // check as the audit log above so a no-op re-POST to an already-disputed order doesn't spam
    // the seller with duplicate notifications.
    const title = order.listing.title.trim() || "your order";
    await createNotification(prisma, {
      userId: order.sellerId,
      type: "order_escrow_dispute_opened",
      title: "Dispute opened",
      body: `The buyer opened a dispute on the escrow order for “${title}”. Payout is on hold until it's resolved.`,
      href: `/account/sales/${encodeURIComponent(order.id)}`,
    });

    const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
    scheduleNotifyAdmins({
      type: "admin_escrow_dispute",
      title: "Escrow dispute opened",
      body: `Buyer opened a dispute on “${title.slice(0, 120)}”.`,
      href: `/admin/orders/${encodeURIComponent(order.id)}`,
      dedupeKey: `escrow-dispute:${order.id}`,
    });
  }

  // TODO: Notify external payment provider dispute API when endpoint is confirmed.

  return NextResponse.json({ ok: true });
}
