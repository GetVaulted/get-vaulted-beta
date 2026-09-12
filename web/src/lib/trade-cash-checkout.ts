import { prisma } from "@/lib/prisma";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { formatMoney, resolveTradeCashParties } from "@/lib/trade-offers";

export type TradeCashCheckoutResult =
  | { ok: true; url: string; alreadyPaid: false; amountUsd: number; payeeUsername: string | null; connectDestination: boolean }
  | { ok: true; url: null; alreadyPaid: true; amountUsd: number }
  | { ok: false; error: string; status: number };

function cashAmountCents(amountUsd: number): number {
  return Math.max(1, Math.round(amountUsd * 100));
}

/**
 * Stripe Checkout for optional trade cash (separate from platform fee + label).
 * Always platform-held until both parties confirm receipt (or admin release/refund).
 * Payer = cash adder; payee = other party.
 */
export async function createTradeCashCheckout(args: {
  tradeOfferId: string;
  payerUserId: string;
}): Promise<TradeCashCheckoutResult> {
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
      cashPaidAt: true,
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
    },
  });
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (offer.status === "disputed") {
    return { ok: false, error: "This trade is disputed — cash checkout is paused.", status: 409 };
  }
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Cash checkout is only available after the trade is accepted.", status: 409 };
  }

  const sides = resolveTradeCashParties({
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    proposerCashUsd: offer.proposerCashUsd,
    recipientCashUsd: offer.recipientCashUsd,
  });
  if (!sides) {
    return { ok: false, error: "This trade has no cash adjustment to pay.", status: 409 };
  }
  if (sides.payerUserId !== args.payerUserId) {
    return { ok: false, error: "Only the party adding cash can pay it on Get Vaulted.", status: 403 };
  }
  if (offer.cashPaidAt) {
    return { ok: true, url: null, alreadyPaid: true, amountUsd: sides.amountUsd };
  }

  const amountCents = cashAmountCents(sides.amountUsd);
  const payee = sides.payeeUserId === offer.proposerId ? offer.proposer : offer.recipient;
  const payerIsProposer = sides.payerUserId === offer.proposerId;
  const payeeUsername = payee.username?.trim() || null;

  const base = publicSiteBaseUrl();
  const tradePath = `/trade/${encodeURIComponent(offer.id)}`;
  const stripe = getStripe();

  const metadata: Record<string, string> = {
    kind: "trade_cash",
    tradeOfferId: offer.id,
    payerUserId: sides.payerUserId,
    payeeUserId: sides.payeeUserId,
    amountCents: String(amountCents),
    party: payerIsProposer ? "proposer" : "recipient",
    /** Always platform-held — released after both confirm receipt. */
    connectDestination: "0",
    cashEscrow: "1",
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ...stripeCheckoutSessionPaymentOptions("trade"),
      success_url: `${base}${tradePath}?cash=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${tradePath}?cash=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Trade cash (held in escrow)",
              description: payeeUsername
                ? `Cash to @${payeeUsername} for this Get Vaulted trade (${formatMoney(sides.amountUsd)}). Held by Get Vaulted until both confirm receipt. Stripe card fees apply.`
                : `Cash for this Get Vaulted trade (${formatMoney(sides.amountUsd)}). Held by Get Vaulted until both confirm receipt. Stripe card fees apply.`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: {
        // No transfer_data — platform holds until releaseTradeCashEscrow.
        metadata,
      },
    },
    {
      idempotencyKey: `trade_cash_escrow_${offer.id}_${sides.payerUserId}_${amountCents}`.slice(0, 255),
    },
  );

  if (!session.url) {
    return { ok: false, error: "Could not start cash checkout.", status: 502 };
  }

  await prisma.tradeOffer.update({
    where: { id: offer.id },
    data: { cashCheckoutSessionId: session.id },
  });

  return {
    ok: true,
    url: session.url,
    alreadyPaid: false,
    amountUsd: sides.amountUsd,
    payeeUsername,
    connectDestination: false,
  };
}

export async function finalizeTradeCashPaid(args: {
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
      proposerCashUsd: true,
      recipientCashUsd: true,
      cashPaidAt: true,
    },
  });
  if (!offer) return;

  const sides = resolveTradeCashParties({
    proposerId: offer.proposerId,
    recipientId: offer.recipientId,
    proposerCashUsd: offer.proposerCashUsd,
    recipientCashUsd: offer.recipientCashUsd,
  });
  if (!sides || sides.payerUserId !== args.payerUserId) return;
  if (offer.cashPaidAt) return;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: {
        cashPaidAt: now,
        cashCheckoutSessionId: args.checkoutSessionId,
        cashPaymentIntentId: args.paymentIntentId?.trim() || undefined,
      },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "cash_paid",
        actorUserId: args.payerUserId,
        note: JSON.stringify({
          amountUsd: sides.amountUsd,
          payeeUserId: sides.payeeUserId,
          checkoutSessionId: args.checkoutSessionId,
          paymentIntentId: args.paymentIntentId ?? null,
          escrow: "platform_held",
        }),
      },
    });
  });
}
