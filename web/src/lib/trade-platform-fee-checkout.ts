import { prisma } from "@/lib/prisma";
import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeCheckoutSessionPaymentOptions } from "@/lib/stripe-payment-method-config";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD, tradePlatformFeeCents } from "@/lib/trade-platform-fee";
import { fetchTradeOutboundShippingQuote } from "@/lib/trade-shipping-quote";
import { purchaseTradePartyLabelAfterCheckout } from "@/lib/trade-shippo-label-purchase";

export type TradePlatformFeeCheckoutResult =
  | { ok: true; url: string; alreadyPaid: false; shippingUsd: number; totalUsd: number }
  | { ok: true; url: null; alreadyPaid: true }
  | { ok: false; error: string; status: number };

/**
 * Create Stripe Checkout for this party's combined charge:
 * $2.99 Get Vaulted platform fee + actual outbound Shippo label rate (one payment).
 */
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
    return { ok: false, error: "Checkout is only available after the trade is accepted.", status: 409 };
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

  const quoteResult = await fetchTradeOutboundShippingQuote({
    tradeOfferId: offer.id,
    payerUserId: args.payerUserId,
  });
  if (!quoteResult.ok) {
    return { ok: false, error: quoteResult.error, status: quoteResult.status };
  }
  const quote = quoteResult.quote;

  const platformFeeCents = tradePlatformFeeCents();
  const shippingCents = quote.amountCents;
  const totalCents = platformFeeCents + shippingCents;
  const base = publicSiteBaseUrl();
  const tradePath = `/trade/${encodeURIComponent(offer.id)}`;
  const stripe = getStripe();

  await prisma.tradeOffer.update({
    where: { id: offer.id },
    data: isProposer
      ? {
          proposerShippingChargedCents: shippingCents,
          proposerShippoShipmentId: quote.shippoShipmentId,
          proposerShippoRateObjectId: quote.shippoRateObjectId,
        }
      : {
          recipientShippingChargedCents: shippingCents,
          recipientShippoShipmentId: quote.shippoShipmentId,
          recipientShippoRateObjectId: quote.shippoRateObjectId,
        },
  });

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
            unit_amount: platformFeeCents,
            product_data: {
              name: "Get Vaulted — trade platform fee",
              description: `$${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} platform fee for your side of this trade.`,
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: shippingCents,
            product_data: {
              name: "Outbound shipping label",
              description: `${quote.carrier} ${quote.serviceLevel} — your package to your trade partner.`,
            },
          },
        },
      ],
      metadata: {
        kind: "trade_platform_fee",
        tradeOfferId: offer.id,
        payerUserId: args.payerUserId,
        party: isProposer ? "proposer" : "recipient",
        shippingChargedCents: String(shippingCents),
        shippoShipmentId: quote.shippoShipmentId,
        shippoRateObjectId: quote.shippoRateObjectId,
        carrier: quote.carrier.slice(0, 80),
        serviceLevel: quote.serviceLevel.slice(0, 120),
        mockShipping: quote.mock ? "1" : "0",
      },
      payment_intent_data: {
        metadata: {
          kind: "trade_platform_fee",
          tradeOfferId: offer.id,
          payerUserId: args.payerUserId,
        },
      },
    },
    {
      idempotencyKey: `trade_checkout_${offer.id}_${args.payerUserId}_${shippingCents}_${quote.shippoRateObjectId}`.slice(
        0,
        255,
      ),
    },
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

  return {
    ok: true,
    url: session.url,
    alreadyPaid: false,
    shippingUsd: shippingCents / 100,
    totalUsd: totalCents / 100,
  };
}

/** Mark platform fee paid and purchase this party's outbound Shippo label (same Stripe charge). */
export async function finalizeTradePlatformFeePaid(args: {
  tradeOfferId: string;
  payerUserId: string;
  checkoutSessionId: string;
  shippingChargedCents?: number | null;
  shippoRateObjectId?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
}): Promise<void> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      proposerPlatformFeePaidAt: true,
      recipientPlatformFeePaidAt: true,
      proposerShippoRateObjectId: true,
      recipientShippoRateObjectId: true,
      proposerShippingChargedCents: true,
      recipientShippingChargedCents: true,
    },
  });
  if (!offer) return;

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) return;

  const alreadyPaid = isProposer
    ? Boolean(offer.proposerPlatformFeePaidAt)
    : Boolean(offer.recipientPlatformFeePaidAt);

  const shippingCents =
    args.shippingChargedCents ??
    (isProposer ? offer.proposerShippingChargedCents : offer.recipientShippingChargedCents) ??
    null;
  const rateId =
    args.shippoRateObjectId?.trim() ||
    (isProposer ? offer.proposerShippoRateObjectId : offer.recipientShippoRateObjectId) ||
    null;

  if (!alreadyPaid) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.tradeOffer.update({
        where: { id: offer.id },
        data: isProposer
          ? {
              proposerPlatformFeePaidAt: now,
              proposerPlatformFeeCheckoutSessionId: args.checkoutSessionId,
              proposerShippingChargedCents: shippingCents ?? undefined,
              proposerShippoRateObjectId: rateId ?? undefined,
            }
          : {
              recipientPlatformFeePaidAt: now,
              recipientPlatformFeeCheckoutSessionId: args.checkoutSessionId,
              recipientShippingChargedCents: shippingCents ?? undefined,
              recipientShippoRateObjectId: rateId ?? undefined,
            },
      });
      await tx.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "platform_fee_paid",
          actorUserId: args.payerUserId,
          note: JSON.stringify({
            amountUsd: GET_VAULTED_TRADE_PLATFORM_FEE_USD,
            shippingChargedCents: shippingCents,
            checkoutSessionId: args.checkoutSessionId,
            party: isProposer ? "proposer" : "recipient",
            combinedCheckout: true,
          }),
        },
      });
    });
  }

  const labelResult = await purchaseTradePartyLabelAfterCheckout({
    tradeOfferId: offer.id,
    payerUserId: args.payerUserId,
    shippoRateObjectId: rateId,
    shippingChargedCents: shippingCents,
    carrier: args.carrier,
    serviceLevel: args.serviceLevel,
  });
  if (!labelResult.ok) {
    console.error("[finalizeTradePlatformFeePaid] label purchase failed", labelResult.error);
  }
}
