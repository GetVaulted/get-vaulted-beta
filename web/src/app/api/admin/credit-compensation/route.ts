import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { creditCompensationStatus, estimateCreditShortfallCents } from "@/lib/admin/credit-compensation";

export const runtime = "nodejs";

/**
 * POST — record that a seller was paid back for buyer-spent credit on one order.
 * Body: `{ orderId, stripeTransferId }`.
 * This does NOT move money. Send the money first (a Stripe Connect transfer to the seller), then record the
 * transfer here. The transfer must go to this seller's Connect account, and one transfer can be recorded against
 * several orders as long as the amounts recorded against it never add up to more than the transfer.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { orderId?: string; stripeTransferId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const transferId = typeof body.stripeTransferId === "string" ? body.stripeTransferId.trim() : "";
  if (!orderId) return NextResponse.json({ error: "Missing order." }, { status: 400 });
  if (!/^tr_[A-Za-z0-9]+$/.test(transferId)) {
    return NextResponse.json({ error: "Enter the Stripe transfer id (starts with tr_)." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      paymentMethod: true,
      sellerPayoutProcessor: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      platformCreditAppliedUsd: true,
      referralCreditAppliedUsd: true,
      platformFeeCents: true,
      sellerCreditShortfallFundedAt: true,
      sellerCreditShortfallFailedAt: true,
      seller: { select: { username: true, stripeAccountId: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.paymentStatus !== "paid") {
    return NextResponse.json({ error: "That order isn't paid." }, { status: 409 });
  }

  const shortfallCents = estimateCreditShortfallCents(order);
  const status = creditCompensationStatus({
    shortfallEstimateCents: shortfallCents,
    fundedAt: order.sellerCreditShortfallFundedAt,
    failedAt: order.sellerCreditShortfallFailedAt,
    sellerPayoutProcessor: order.sellerPayoutProcessor ?? null,
    paymentMethod: order.paymentMethod ?? null,
  });
  if (status === "compensated") {
    return NextResponse.json({ error: "That order is already marked compensated." }, { status: 409 });
  }
  if (status !== "owed" && status !== "failed") {
    return NextResponse.json({ error: "Nothing is owed to the seller on that order." }, { status: 409 });
  }

  const accountId = order.seller.stripeAccountId?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "That seller has no Stripe payout account." }, { status: 409 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe isn't configured, so the transfer can't be checked." }, { status: 503 });
  }

  try {
    const t = await getStripe().transfers.retrieve(transferId);
    const destination = typeof t.destination === "string" ? t.destination : t.destination?.id;
    if (destination !== accountId) {
      return NextResponse.json({ error: "That transfer went to a different Stripe account." }, { status: 409 });
    }
    const alreadyRecorded = await prisma.order.aggregate({
      where: { sellerCreditShortfallTransferId: transferId },
      _sum: { sellerCreditShortfallCents: true },
    });
    const usedCents = alreadyRecorded._sum.sellerCreditShortfallCents ?? 0;
    const remainingCents = t.amount - (t.amount_reversed ?? 0) - usedCents;
    if (remainingCents < shortfallCents) {
      return NextResponse.json(
        {
          error: `That transfer only has $${(Math.max(0, remainingCents) / 100).toFixed(2)} left to assign and this order needs $${(shortfallCents / 100).toFixed(2)}.`,
        },
        { status: 409 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Stripe couldn't find that transfer." }, { status: 404 });
  }

  try {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        sellerCreditShortfallCents: shortfallCents,
        sellerCreditShortfallTransferId: transferId,
        sellerCreditShortfallFundedAt: new Date(),
        sellerCreditShortfallFailedAt: null,
        sellerCreditShortfallFailureDetail: null,
      },
    });
    await prisma.payoutEligibilityAuditLog
      .create({
        data: {
          sellerId: order.sellerId,
          orderId: order.id,
          adminId: gate.userId,
          action: "credit_shortfall_marked_compensated",
          newStatus: `$${(shortfallCents / 100).toFixed(2)}`,
          reason: `Seller compensated for buyer-spent credit via ${transferId}`,
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ ok: true, orderId: order.id, amountUsd: shortfallCents / 100 });
  } catch (e) {
    console.error("[admin/credit-compensation]", e);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
