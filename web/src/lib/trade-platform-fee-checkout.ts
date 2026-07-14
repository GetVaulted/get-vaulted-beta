import { prisma } from "@/lib/prisma";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD, tradePlatformFeeCents } from "@/lib/trade-platform-fee";

export type TradePlatformFeeCheckoutResult =
  | { ok: true; url: string; alreadyPaid: false }
  | { ok: true; url: null; alreadyPaid: true }
  | { ok: false; error: string; status: number };

/** Create Stripe Checkout for this party's $2.99 Get Vaulted trade platform fee. */
export async function createTradePlatformFeeCheckout(args: {
  tradeOfferId: string;
  payerUserId: string;
}): Promise<TradePlatformFeeCheckoutResult> {
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
      proposerPlatformFeePaidAt: true,
      recipientPlatformFeePaidAt: true,
    },
  });
  if (!offer) return { ok: false, error: "Offer not found.", status: 404 };
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Platform fee is only due after the trade is accepted.", status: 409 };
  }

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) {
    return { ok: false, error: "Only trade participants can pay this fee.", status: 403 };
  }

  const alreadyPaid = isProposer
    ? Boolean(offer.proposerPlatformFeePaidAt)
    : Boolean(offer.recipientPlatformFeePaidAt);
  if (alreadyPaid) {
    return { ok: true, url: null, alreadyPaid: true };
  }

  const amountCents = tradePlatformFeeCents();
  const base = publicSiteBaseUrl();
  const tradePath = `/trade/${encodeURIComponent(offer.id)}`;
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ...stripeCheckoutSessionPaymentOptions("trade"),
      success_url: `${base}${tradePath}?fee=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${tradePath}?fee=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Get Vaulted — trade platform fee",
              description: `$${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} platform fee for your side of this trade. Outbound shipping is charged separately at the actual label rate.`,
            },
          },
        },
      ],
      metadata: {
        kind: "trade_platform_fee",
        tradeOfferId: offer.id,
        payerUserId: args.payerUserId,
        party: isProposer ? "proposer" : "recipient",
      },
      payment_intent_data: {
        metadata: {
          kind: "trade_platform_fee",
          tradeOfferId: offer.id,
          payerUserId: args.payerUserId,
        },
      },
    },
    { idempotencyKey: `trade_platform_fee_${offer.id}_${args.payerUserId}` },
  );

  if (!session.url) {
    return { ok: false, error: "Could not start checkout.", status: 502 };
  }

  await prisma.tradeOffer.update({
    where: { id: offer.id },
    data: isProposer
      ? { proposerPlatformFeeCheckoutSessionId: session.id }
      : { recipientPlatformFeeCheckoutSessionId: session.id },
  });

  return { ok: true, url: session.url, alreadyPaid: false };
}

/** Mark a party's $2.99 platform fee paid after Stripe Checkout completes. */
export async function finalizeTradePlatformFeePaid(args: {
  tradeOfferId: string;
  payerUserId: string;
  checkoutSessionId: string;
}): Promise<void> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      proposerPlatformFeePaidAt: true,
      recipientPlatformFeePaidAt: true,
    },
  });
  if (!offer) return;

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) return;

  if (isProposer && offer.proposerPlatformFeePaidAt) return;
  if (isRecipient && offer.recipientPlatformFeePaidAt) return;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: isProposer
        ? {
            proposerPlatformFeePaidAt: now,
            proposerPlatformFeeCheckoutSessionId: args.checkoutSessionId,
          }
        : {
            recipientPlatformFeePaidAt: now,
            recipientPlatformFeeCheckoutSessionId: args.checkoutSessionId,
          },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "platform_fee_paid",
        actorUserId: args.payerUserId,
        note: JSON.stringify({
          amountUsd: GET_VAULTED_TRADE_PLATFORM_FEE_USD,
          checkoutSessionId: args.checkoutSessionId,
          party: isProposer ? "proposer" : "recipient",
        }),
      },
    });
  });
}
