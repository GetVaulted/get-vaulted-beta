import { prisma } from "@/lib/prisma";
import { isShippoConfigured, shippoCreateShipment, shippoListRates, shippoPurchaseRate } from "@/lib/shippo";
import { resolveShippoPurchaseLabel } from "@/lib/shippo-transaction-label";
import { loadTradeParticipantShipAddress, toShippoAddressWithContact } from "@/lib/trade-shipping-quote";
import { defaultTradeParcelForTier, normalizeTradeWeightTier } from "@/lib/trade-parcel-defaults";

/**
 * Purchase the payer's outbound Shippo label after combined checkout.
 * Prefers the rate charged in Stripe; falls back to a fresh cheapest-rate purchase if needed.
 */
export async function purchaseTradePartyLabelAfterCheckout(args: {
  tradeOfferId: string;
  payerUserId: string;
  shippoRateObjectId?: string | null;
  shippingChargedCents?: number | null;
  carrier?: string | null;
  serviceLevel?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: args.tradeOfferId },
    select: {
      id: true,
      proposerId: true,
      recipientId: true,
      shippingWeightTier: true,
      proposerShippoTransactionId: true,
      recipientShippoTransactionId: true,
    },
  });
  if (!offer) return { ok: false, error: "Offer not found." };

  const isProposer = offer.proposerId === args.payerUserId;
  const isRecipient = offer.recipientId === args.payerUserId;
  if (!isProposer && !isRecipient) return { ok: false, error: "Not a participant." };

  const existingTx = isProposer ? offer.proposerShippoTransactionId : offer.recipientShippoTransactionId;
  if (existingTx?.trim()) return { ok: true };

  if (!isShippoConfigured()) {
    // Dev/mock: mark a placeholder label so local flows can complete without Shippo.
    const now = new Date();
    await prisma.tradeOffer.update({
      where: { id: offer.id },
      data: isProposer
        ? {
            proposerShippoTransactionId: `mock_tx_${offer.id}_proposer`,
            proposerLabelUrl: null,
            proposerTrackingNumber: "MOCKTRACK",
            proposerLabelPurchasedAt: now,
            proposerLabelErrorMessage: null,
          }
        : {
            recipientShippoTransactionId: `mock_tx_${offer.id}_recipient`,
            recipientLabelUrl: null,
            recipientTrackingNumber: "MOCKTRACK",
            recipientLabelPurchasedAt: now,
            recipientLabelErrorMessage: null,
          },
    });
    await prisma.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "shipping_label_purchased",
        actorUserId: args.payerUserId,
        note: JSON.stringify({ mock: true, party: isProposer ? "proposer" : "recipient" }),
      },
    });
    return { ok: true };
  }

  let rateId = args.shippoRateObjectId?.trim() || null;
  if (!rateId || rateId.startsWith("mock_")) {
    rateId = await purchaseFreshCheapestRate(offer.id, args.payerUserId, offer.shippingWeightTier);
  }

  if (!rateId) {
    return { ok: false, error: "Could not resolve a Shippo rate to purchase." };
  }

  try {
    const purchase = await shippoPurchaseRate(rateId, "PDF_4x6");
    const label = await resolveShippoPurchaseLabel(purchase);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.tradeOffer.update({
        where: { id: offer.id },
        data: isProposer
          ? {
              proposerShippoTransactionId: label.transactionId,
              proposerShippoRateObjectId: rateId,
              proposerLabelUrl: label.labelUrl,
              proposerTrackingNumber: label.trackingNumber,
              proposerTrackingUrl: label.trackingUrl,
              proposerLabelPurchasedAt: now,
              proposerLabelErrorMessage: null,
              proposerShippingChargedCents: args.shippingChargedCents ?? undefined,
            }
          : {
              recipientShippoTransactionId: label.transactionId,
              recipientShippoRateObjectId: rateId,
              recipientLabelUrl: label.labelUrl,
              recipientTrackingNumber: label.trackingNumber,
              recipientTrackingUrl: label.trackingUrl,
              recipientLabelPurchasedAt: now,
              recipientLabelErrorMessage: null,
              recipientShippingChargedCents: args.shippingChargedCents ?? undefined,
            },
      });
      await tx.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "shipping_label_purchased",
          actorUserId: args.payerUserId,
          note: JSON.stringify({
            party: isProposer ? "proposer" : "recipient",
            carrier: args.carrier ?? null,
            serviceLevel: args.serviceLevel ?? null,
            trackingNumber: label.trackingNumber,
            shippingChargedCents: args.shippingChargedCents ?? null,
          }),
        },
      });
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Label purchase failed.";
    await prisma.tradeOffer.update({
      where: { id: offer.id },
      data: isProposer
        ? { proposerLabelErrorMessage: msg.slice(0, 500) }
        : { recipientLabelErrorMessage: msg.slice(0, 500) },
    });
    await prisma.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "shipping_label_failed",
        actorUserId: args.payerUserId,
        note: JSON.stringify({ error: msg.slice(0, 300), party: isProposer ? "proposer" : "recipient" }),
      },
    });
    return { ok: false, error: msg };
  }
}

async function purchaseFreshCheapestRate(
  tradeOfferId: string,
  payerUserId: string,
  shippingWeightTier: string | null,
): Promise<string | null> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: tradeOfferId },
    select: { proposerId: true, recipientId: true },
  });
  if (!offer) return null;
  const counterpartyId = offer.proposerId === payerUserId ? offer.recipientId : offer.proposerId;
  const from = await loadTradeParticipantShipAddress(payerUserId);
  const to = await loadTradeParticipantShipAddress(counterpartyId);
  if (!from || !to) return null;

  const parcel = defaultTradeParcelForTier(normalizeTradeWeightTier(shippingWeightTier));
  const shipment = (await shippoCreateShipment({
    address_from: toShippoAddressWithContact(from),
    address_to: toShippoAddressWithContact(to, { residential: true }),
    parcels: [parcel],
    async: false,
  })) as { object_id?: string; rates?: Array<{ object_id?: string; amount?: string | number }> };

  const shipmentId = shipment.object_id?.trim();
  if (!shipmentId) return null;
  const inline = Array.isArray(shipment.rates) ? shipment.rates : [];
  const listed =
    inline.length > 0
      ? inline
      : (((await shippoListRates(shipmentId)) as { results?: Array<{ object_id?: string; amount?: string | number }> })
          .results ?? []);

  const ranked = listed
    .map((r) => {
      const id = r.object_id?.trim();
      const cents = r.amount == null ? null : Math.round(Number(r.amount) * 100);
      if (!id || cents == null || !Number.isFinite(cents) || cents <= 0) return null;
      return { id, cents };
    })
    .filter((r): r is { id: string; cents: number } => Boolean(r))
    .sort((a, b) => a.cents - b.cents);

  return ranked[0]?.id ?? null;
}
