import { prisma } from "@/lib/prisma";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import {
  resolveTradeSecurityDepositUsd,
  tradeRequiresSecurityDeposit,
  tradeSecurityDepositCentsFromUsd,
} from "@/lib/trade-security-deposit";
import { formatMoney } from "@/lib/trade-offers";

export type TradeDepositCheckoutResult =
  | { ok: true; url: string; alreadyPaid: false; amountUsd: number }
  | { ok: true; url: null; alreadyPaid: true; amountUsd: number }
  | { ok: false; error: string; status: number };

function sumSideValue(
  items: Array<{ side: string; listingPriceUsdSnapshot: number }>,
  side: "proposer" | "recipient",
): number {
  return items
    .filter((i) => i.side === side)
    .reduce((sum, i) => sum + Math.max(0, i.listingPriceUsdSnapshot), 0);
}

/**
 * Stripe Checkout for the refundable security deposit (straight / $0-cash trades).
 * Amount = 25% of higher-side item value, clamped $100–$500, locked on the offer.
 * Always platform-held; refunded when both parties confirm receipt.
 */
export async function createTradeDepositCheckout(args: {
  tradeOfferId: string;
  payerUserId: string;
}): Promise<TradeDepositCheckoutResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Payments are not configured.", status: 503 };
  }

  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      status: true,
      proposerId: true,
      recipientId: true,
      proposerCashUsd: true,
      recipientCashUsd: true,
      proposerDepositPaidAt: true,
      recipientDepositPaidAt: true,
      securityDepositCents: true,
      items: { select: { side: true, listingPriceUsdSnapshot: true } },
    },
  });
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (offer.status === "disputed") {
    return { ok: false, error: "This trade is disputed — deposit checkout is paused.", status: 409 };
  }
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Deposit checkout is only available after the trade is accepted.", status: 409 };
  }
  if (!tradeRequiresSecurityDeposit(offer)) {
    return {
      ok: false,
      error: "Security deposits apply to straight trades only. This trade already has on-platform cash escrow.",
      status: 409,
    };
  }

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) {
    return { ok: false, error: "Only trade participants can pay the deposit.", status: 403 };
  }

  const amountUsd = resolveTradeSecurityDepositUsd({
    proposerCashUsd: offer.proposerCashUsd,
    recipientCashUsd: offer.recipientCashUsd,
    proposerItemsValueUsd: sumSideValue(offer.items, "proposer"),
    recipientItemsValueUsd: sumSideValue(offer.items, "recipient"),
    securityDepositCents: offer.securityDepositCents,
  });
  const amountCents = tradeSecurityDepositCentsFromUsd(amountUsd);

  const alreadyPaid = isProposer ? Boolean(offer.proposerDepositPaidAt) : Boolean(offer.recipientDepositPaidAt);
  if (alreadyPaid) {
    return { ok: true, url: null, alreadyPaid: true, amountUsd };
  }

  // Lock the amount so both parties always pay the same deposit.
  if (offer.securityDepositCents == null || offer.securityDepositCents !== amountCents) {
    await prisma.tradeOffer.update({
      where: { id: offer.id },
      data: { securityDepositCents: amountCents },
    });
  }

  const base = publicSiteBaseUrl();
  const tradePath = `/trade/${encodeURIComponent(offer.id)}`;
  const stripe = getStripe();
  const party = isProposer ? "proposer" : "recipient";

  const metadata: Record<string, string> = {
    kind: "trade_deposit",
    tradeOfferId: offer.id,
    payerUserId: args.payerUserId,
    party,
    amountCents: String(amountCents),
    cashEscrow: "1",
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ...stripeCheckoutSessionPaymentOptions("trade"),
      success_url: `${base}${tradePath}?deposit=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${tradePath}?deposit=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Trade security deposit (refundable)",
              description: `Refundable ${formatMoney(amountUsd)} deposit (25% of higher-side value, $100–$500). Held until both confirm receipt, then refunded. Stripe card fees apply.`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
    },
    {
      idempotencyKey: `trade_deposit_${offer.id}_${party}_${amountCents}`.slice(0, 255),
    },
  );

  if (!session.url) {
    return { ok: false, error: "Could not start deposit checkout.", status: 502 };
  }

  await prisma.tradeOffer.update({
    where: { id: offer.id },
    data: isProposer
      ? { proposerDepositCheckoutSessionId: session.id, securityDepositCents: amountCents }
      : { recipientDepositCheckoutSessionId: session.id, securityDepositCents: amountCents },
  });

  return { ok: true, url: session.url, alreadyPaid: false, amountUsd };
}

export async function finalizeTradeDepositPaid(args: {
  tradeOfferId: string;
  payerUserId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
}): Promise<void> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      proposerDepositPaidAt: true,
      recipientDepositPaidAt: true,
      securityDepositCents: true,
    },
  });
  if (!offer) return;

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) return;

  const already = isProposer ? offer.proposerDepositPaidAt : offer.recipientDepositPaidAt;
  if (already) return;

  const amountUsd =
    offer.securityDepositCents != null && offer.securityDepositCents > 0
      ? offer.securityDepositCents / 100
      : null;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: isProposer
        ? {
            proposerDepositPaidAt: now,
            proposerDepositCheckoutSessionId: args.checkoutSessionId,
            proposerDepositPaymentIntentId: args.paymentIntentId?.trim() || undefined,
          }
        : {
            recipientDepositPaidAt: now,
            recipientDepositCheckoutSessionId: args.checkoutSessionId,
            recipientDepositPaymentIntentId: args.paymentIntentId?.trim() || undefined,
          },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "deposit_paid",
        actorUserId: args.payerUserId,
        note: JSON.stringify({
          amountUsd,
          party: isProposer ? "proposer" : "recipient",
          checkoutSessionId: args.checkoutSessionId,
          paymentIntentId: args.paymentIntentId ?? null,
        }),
      },
    });
  });
}

export type TradeDepositRefundResult =
  | { ok: true; alreadyDone: boolean; refundId: string | null }
  | { ok: false; error: string; status: number };

async function refundOnePartyDeposit(args: {
  tradeOfferId: string;
  party: "proposer" | "recipient";
  actorUserId: string | null;
  reason: string;
}): Promise<TradeDepositRefundResult> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      securityDepositCents: true,
      proposerDepositPaidAt: true,
      recipientDepositPaidAt: true,
      proposerDepositPaymentIntentId: true,
      recipientDepositPaymentIntentId: true,
      proposerDepositRefundedAt: true,
      recipientDepositRefundedAt: true,
      proposerDepositRefundId: true,
      recipientDepositRefundId: true,
    },
  });
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };

  const paidAt = args.party === "proposer" ? offer.proposerDepositPaidAt : offer.recipientDepositPaidAt;
  const refundedAt =
    args.party === "proposer" ? offer.proposerDepositRefundedAt : offer.recipientDepositRefundedAt;
  const refundIdExisting =
    args.party === "proposer" ? offer.proposerDepositRefundId : offer.recipientDepositRefundId;
  const pi =
    args.party === "proposer"
      ? offer.proposerDepositPaymentIntentId?.trim()
      : offer.recipientDepositPaymentIntentId?.trim();
  const userId = args.party === "proposer" ? offer.proposerId : offer.recipientId;

  if (!paidAt) return { ok: true, alreadyDone: true, refundId: null };
  if (refundedAt) return { ok: true, alreadyDone: true, refundId: refundIdExisting };

  if (!pi) return { ok: false, error: `Missing ${args.party} deposit payment intent.`, status: 409 };
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not configured.", status: 503 };

  const amountCents =
    offer.securityDepositCents != null && offer.securityDepositCents > 0
      ? offer.securityDepositCents
      : null;
  if (amountCents == null) {
    return { ok: false, error: "Missing locked security deposit amount.", status: 409 };
  }
  const amountUsd = amountCents / 100;

  const stripe = getStripe();
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: pi,
        amount: amountCents,
        reason: "requested_by_customer",
        metadata: {
          kind: "trade_deposit_refund",
          tradeOfferId: offer.id,
          party: args.party,
          reason: args.reason,
        },
      },
      { idempotencyKey: `trade_deposit_refund_${offer.id}_${args.party}_${amountCents}`.slice(0, 255) },
    );

    const now = new Date();
    await prisma.$transaction([
      prisma.tradeOffer.update({
        where: { id: offer.id },
        data:
          args.party === "proposer"
            ? { proposerDepositRefundedAt: now, proposerDepositRefundId: refund.id }
            : { recipientDepositRefundedAt: now, recipientDepositRefundId: refund.id },
      }),
      prisma.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "deposit_refunded",
          actorUserId: args.actorUserId,
          note: JSON.stringify({
            amountUsd,
            party: args.party,
            refundId: refund.id,
            reason: args.reason,
          }),
        },
      }),
    ]);

    const { createNotification } = await import("@/lib/notifications");
    await createNotification(prisma, {
      userId,
      type: "trade_deposit_refunded",
      title: "Trade deposit refunded",
      body: `Your ${formatMoney(amountUsd)} trade security deposit was refunded.`,
      href: `/trade/${encodeURIComponent(offer.id)}`,
    });

    return { ok: true, alreadyDone: false, refundId: refund.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message.slice(0, 200), status: 502 };
  }
}

/** Refund both parties' deposits after a successful complete (or admin resolve). */
export async function refundTradeSecurityDeposits(input: {
  tradeOfferId: string;
  actorUserId: string | null;
  reason: "both_confirmed_receipt" | "admin_refund";
}): Promise<{ proposer: TradeDepositRefundResult; recipient: TradeDepositRefundResult }> {
  const proposer = await refundOnePartyDeposit({
    tradeOfferId: input.tradeOfferId,
    party: "proposer",
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
  const recipient = await refundOnePartyDeposit({
    tradeOfferId: input.tradeOfferId,
    party: "recipient",
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
  return { proposer, recipient };
}
