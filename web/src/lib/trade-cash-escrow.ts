import type { Prisma } from "@/generated/prisma/client";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { resolveTradeCashParties } from "@/lib/trade-offers";

export type TradeCashEscrowResult =
  | { ok: true; alreadyDone: boolean; transferId?: string | null; refundId?: string | null; pendingConnect?: boolean }
  | { ok: false; error: string; status: number };

function cashAmountCents(amountUsd: number): number {
  return Math.max(1, Math.round(amountUsd * 100));
}

/** True when cash is paid and still held (not released, not refunded). */
export function isTradeCashHeld(offer: {
  cashPaidAt: Date | null;
  cashReleasedAt: Date | null;
  cashRefundedAt: Date | null;
}): boolean {
  return Boolean(offer.cashPaidAt && !offer.cashReleasedAt && !offer.cashRefundedAt);
}

/**
 * Release platform-held trade cash to the payee's Stripe Connect account.
 * No-op if no cash / already released / refunded. If payee has no Connect, leaves held and flags error.
 */
export async function releaseTradeCashEscrow(input: {
  tradeOfferId: string;
  actorUserId: string | null;
  reason: "both_confirmed_receipt" | "admin_release";
}): Promise<TradeCashEscrowResult> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: input.tradeOfferId },
    select: {
      id: true,
      status: true,
      proposerId: true,
      recipientId: true,
      proposerCashUsd: true,
      recipientCashUsd: true,
      cashPaidAt: true,
      cashPaymentIntentId: true,
      cashReleasedAt: true,
      cashRefundedAt: true,
      cashTransferId: true,
      proposer: { select: { stripeAccountId: true, stripeChargesEnabled: true, username: true } },
      recipient: { select: { stripeAccountId: true, stripeChargesEnabled: true, username: true } },
    },
  });
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };

  const sides = resolveTradeCashParties({
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    proposerCashUsd: offer.proposerCashUsd,
    recipientCashUsd: offer.recipientCashUsd,
  });
  if (!sides || !offer.cashPaidAt) {
    return { ok: true, alreadyDone: true, transferId: null };
  }
  if (offer.cashReleasedAt) {
    return { ok: true, alreadyDone: true, transferId: offer.cashTransferId };
  }
  if (offer.cashRefundedAt) {
    return { ok: false, error: "Trade cash was already refunded.", status: 409 };
  }
  if (offer.status === "disputed" && input.reason !== "admin_release") {
    return { ok: false, error: "Cash stays held while the trade is disputed.", status: 409 };
  }

  const payee = sides.payeeUserId === offer.proposerId ? offer.proposer : offer.recipient;
  const destination =
    payee.stripeChargesEnabled && payee.stripeAccountId?.trim() ? payee.stripeAccountId.trim() : null;
  const amountCents = cashAmountCents(sides.amountUsd);
  const pi = offer.cashPaymentIntentId?.trim() || null;

  if (!destination) {
    await prisma.tradeOffer.update({
      where: { id: offer.id },
      data: {
        cashReleaseError:
          "Payee has no Stripe Connect account ready — cash remains held for admin/PayPal release.",
      },
    });
    const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
    scheduleNotifyAdmins({
      type: "admin_trade_cash_release_pending",
      title: "Trade cash needs release",
      body: `Trade ${offer.id} completed but payee @${payee.username ?? "user"} has no Connect account. Cash is still held.`,
      href: `/trade/${encodeURIComponent(offer.id)}`,
      dedupeKey: `trade-cash-release-pending:${offer.id}`,
    });
    return { ok: true, alreadyDone: false, transferId: null, pendingConnect: true };
  }

  if (!isStripeConfigured()) {
    return { ok: false, error: "Payments are not configured.", status: 503 };
  }

  const stripe = getStripe();
  const idempotencyKey = `trade_cash_release_${offer.id}_${amountCents}`.slice(0, 255);

  try {
    const balance = await stripe.balance.retrieve();
    const availableUsd = (balance.available ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    if (availableUsd < amountCents) {
      const detail = `INSUFFICIENT_PLATFORM_BALANCE availableUsdCents=${availableUsd} needed=${amountCents}`;
      await prisma.tradeOffer.update({
        where: { id: offer.id },
        data: { cashReleaseError: detail.slice(0, 500) },
      });
      return { ok: false, error: "Platform balance is too low to release trade cash.", status: 503 };
    }

    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination,
        description: `Get Vaulted trade cash for offer ${offer.id}`,
        metadata: {
          kind: "trade_cash_release",
          tradeOfferId: offer.id,
          payeeUserId: sides.payeeUserId,
          payerUserId: sides.payerUserId,
          reason: input.reason,
        },
        ...(pi ? { transfer_group: pi } : {}),
      },
      { idempotencyKey },
    );

    const now = new Date();
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data: {
          cashReleasedAt: now,
          cashTransferId: transfer.id,
          cashReleaseError: null,
        },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "cash_released",
          actorUserId: input.actorUserId,
          note: JSON.stringify({
            amountUsd: sides.amountUsd,
            transferId: transfer.id,
            reason: input.reason,
            payeeUserId: sides.payeeUserId,
          }),
        },
      }),
    ]);

    await createNotification(prisma, {
      userId: sides.payeeUserId,
      type: "trade_cash_released",
      title: "Trade cash released",
      body: `$${sides.amountUsd.toFixed(2)} from your trade was released to your payout account.`,
      href: `/trade/${encodeURIComponent(offer.id)}`,
    });

    return { ok: true, alreadyDone: false, transferId: transfer.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.tradeOffer.update({
      where: { id: offer.id },
      data: { cashReleaseError: message.slice(0, 500) },
    });
    return { ok: false, error: message.slice(0, 200), status: 502 };
  }
}

/** Refund platform-held trade cash to the payer. */
export async function refundTradeCashEscrow(input: {
  tradeOfferId: string;
  actorUserId: string | null;
  reason: "admin_refund" | "dispute_refund";
}): Promise<TradeCashEscrowResult> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: input.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      proposerCashUsd: true,
      recipientCashUsd: true,
      cashPaidAt: true,
      cashPaymentIntentId: true,
      cashReleasedAt: true,
      cashRefundedAt: true,
      cashRefundId: true,
    },
  });
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };

  const sides = resolveTradeCashParties({
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    proposerCashUsd: offer.proposerCashUsd,
    recipientCashUsd: offer.recipientCashUsd,
  });
  if (!sides || !offer.cashPaidAt) {
    return { ok: true, alreadyDone: true, refundId: null };
  }
  if (offer.cashRefundedAt) {
    return { ok: true, alreadyDone: true, refundId: offer.cashRefundId };
  }
  if (offer.cashReleasedAt) {
    return { ok: false, error: "Cash was already released to the payee — cannot refund automatically.", status: 409 };
  }

  const pi = offer.cashPaymentIntentId?.trim();
  if (!pi) {
    return { ok: false, error: "Missing payment intent for refund.", status: 409 };
  }
  if (!isStripeConfigured()) {
    return { ok: false, error: "Payments are not configured.", status: 503 };
  }

  const stripe = getStripe();
  const amountCents = cashAmountCents(sides.amountUsd);
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: pi,
        amount: amountCents,
        reason: "requested_by_customer",
        metadata: {
          kind: "trade_cash_refund",
          tradeOfferId: offer.id,
          reason: input.reason,
        },
      },
      { idempotencyKey: `trade_cash_refund_${offer.id}_${amountCents}`.slice(0, 255) },
    );

    const now = new Date();
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data: {
          cashRefundedAt: now,
          cashRefundId: refund.id,
          cashReleaseError: null,
        },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "cash_refunded",
          actorUserId: input.actorUserId,
          note: JSON.stringify({
            amountUsd: sides.amountUsd,
            refundId: refund.id,
            reason: input.reason,
            payerUserId: sides.payerUserId,
          }),
        },
      }),
    ]);

    await createNotification(prisma, {
      userId: sides.payerUserId,
      type: "trade_cash_refunded",
      title: "Trade cash refunded",
      body: `$${sides.amountUsd.toFixed(2)} trade cash was refunded to your payment method.`,
      href: `/trade/${encodeURIComponent(offer.id)}`,
    });

    return { ok: true, alreadyDone: false, refundId: refund.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message.slice(0, 200), status: 502 };
  }
}

export async function openTradeDispute(input: {
  tradeOfferId: string;
  actorUserId: string;
  reason: string;
}): Promise<TradeCashEscrowResult & { status?: number }> {
  const reason = input.reason.trim().slice(0, 500);
  if (reason.length < 8) {
    return { ok: false, error: "Please describe the issue (at least 8 characters).", status: 400 };
  }

  const offer = await prisma.tradeOffer.findUnique({
    where: { id: input.tradeOfferId },
    select: {
      id: true,
      status: true,
      proposerId: true,
      recipientId: true,
      cashReleasedAt: true,
      disputedAt: true,
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
    },
  });
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };

  const isParticipant = offer.proposerId === input.actorUserId || offer.recipientId === input.actorUserId;
  if (!isParticipant) return { ok: false, error: "Only trade participants can open a dispute.", status: 403 };

  if (offer.status === "disputed" || offer.disputedAt) {
    return { ok: true, alreadyDone: true };
  }
  if (offer.status !== "accepted") {
    return {
      ok: false,
      error:
        offer.status === "completed"
          ? "This trade is already completed. Contact support if you still need help."
          : "Disputes are only available while the trade is accepted and in progress.",
      status: 409,
    };
  }
  if (offer.cashReleasedAt) {
    return {
      ok: false,
      error: "Trade cash was already released. Contact support for help.",
      status: 409,
    };
  }

  const now = new Date();
  const partnerId = offer.proposerId === input.actorUserId ? offer.recipientId : offer.proposerId;

  await prisma.$transaction([
    prisma.tradeOffer.update({
      where: { id: offer.id },
      data: {
        status: "disputed",
        disputedAt: now,
        disputeOpenedByUserId: input.actorUserId,
        disputeReason: reason,
      } satisfies Prisma.TradeOfferUpdateInput,
    }),
    prisma.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "dispute_opened",
        actorUserId: input.actorUserId,
        note: JSON.stringify({ reason }),
      },
    }),
  ]);

  await createNotification(prisma, {
    userId: partnerId,
    type: "trade_dispute_opened",
    title: "Trade dispute opened",
    body: "Your trade partner opened a dispute. Cash (if any) stays held until Get Vaulted resolves it.",
    href: `/trade/${encodeURIComponent(offer.id)}`,
  });

  const { scheduleNotifyAdmins } = await import("@/lib/admin/notify-admins");
  scheduleNotifyAdmins({
    type: "admin_trade_dispute",
    title: "Trade dispute opened",
    body: reason.slice(0, 160),
    href: `/trade/${encodeURIComponent(offer.id)}`,
    dedupeKey: `trade-dispute:${offer.id}`,
  });

  return { ok: true, alreadyDone: false };
}

export type AdminTradeEscrowAction = "release" | "refund" | "resolve_complete" | "reinstate";

export async function adminResolveTradeEscrow(input: {
  tradeOfferId: string;
  adminUserId: string;
  action: AdminTradeEscrowAction;
}): Promise<TradeCashEscrowResult> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: input.tradeOfferId },
    select: { id: true, status: true, cashPaidAt: true, cashReleasedAt: true, cashRefundedAt: true },
  });
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };

  if (input.action === "release") {
    const released = await releaseTradeCashEscrow({
      tradeOfferId: offer.id,
      actorUserId: input.adminUserId,
      reason: "admin_release",
    });
    if (!released.ok) return released;
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data: {
          status: "completed",
          disputedAt: null,
        },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "dispute_resolved",
          actorUserId: input.adminUserId,
          note: JSON.stringify({ action: "release" }),
        },
      }),
    ]);
    return released;
  }

  if (input.action === "refund") {
    const refunded = await refundTradeCashEscrow({
      tradeOfferId: offer.id,
      actorUserId: input.adminUserId,
      reason: "admin_refund",
    });
    if (!refunded.ok && refunded.status !== 409) return refunded;
    try {
      const { refundTradeSecurityDeposits } = await import("@/lib/trade-deposit-checkout");
      await refundTradeSecurityDeposits({
        tradeOfferId: offer.id,
        actorUserId: input.adminUserId,
        reason: "admin_refund",
      });
    } catch (e) {
      console.error("[adminResolveTradeEscrow] deposit refund failed", offer.id, e);
    }
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data: {
          status: "cancelled",
          disputedAt: null,
        },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "dispute_resolved",
          actorUserId: input.adminUserId,
          note: JSON.stringify({ action: "refund" }),
        },
      }),
    ]);
    return refunded.ok ? refunded : { ok: true, alreadyDone: true, refundId: null };
  }

  if (input.action === "reinstate") {
    if (offer.status !== "disputed") {
      return { ok: false, error: "Only disputed trades can be reinstated.", status: 409 };
    }
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data: {
          status: "accepted",
          disputedAt: null,
          disputeReason: null,
          disputeOpenedByUserId: null,
        },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "dispute_resolved",
          actorUserId: input.adminUserId,
          note: JSON.stringify({ action: "reinstate" }),
        },
      }),
    ]);
    return { ok: true, alreadyDone: false };
  }

  // resolve_complete — mark completed without moving money (or after money already handled)
  await prisma.$transaction([
    prisma.tradeOffer.update({
      where: { id: offer.id },
      data: {
        status: "completed",
        disputedAt: null,
      },
    }),
    prisma.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "dispute_resolved",
        actorUserId: input.adminUserId,
        note: JSON.stringify({ action: "resolve_complete" }),
      },
    }),
  ]);
  return { ok: true, alreadyDone: false };
}
