import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type TradeFulfillmentOffer = {
  id: string;
  status: string;
  proposerId: string;
  recipientId: string;
  proposerCashUsd: number;
  recipientCashUsd: number;
  proposerLabelPurchasedAt: Date | null;
  recipientLabelPurchasedAt: Date | null;
  proposerLabelUrl: string | null;
  recipientLabelUrl: string | null;
  proposerTrackingNumber: string | null;
  recipientTrackingNumber: string | null;
  proposerShippedAt: Date | null;
  recipientShippedAt: Date | null;
  proposerReceivedAt: Date | null;
  recipientReceivedAt: Date | null;
  proposerDepositPaidAt: Date | null;
  recipientDepositPaidAt: Date | null;
};

export type TradeFulfillmentResult =
  | { ok: true; alreadyDone: boolean; completed: boolean }
  | { ok: false; error: string; status: number };

function partyHasLabel(offer: TradeFulfillmentOffer, isProposer: boolean): boolean {
  if (isProposer) {
    return Boolean(offer.proposerLabelPurchasedAt || offer.proposerLabelUrl?.trim());
  }
  return Boolean(offer.recipientLabelPurchasedAt || offer.recipientLabelUrl?.trim());
}

async function loadOffer(tradeOfferId: string): Promise<TradeFulfillmentOffer | null> {
  return prisma.tradeOffer.findUnique({
    where: { id: tradeOfferId },
    select: {
      id: true,
      status: true,
      proposerId: true,
      recipientId: true,
      proposerCashUsd: true,
      recipientCashUsd: true,
      proposerLabelPurchasedAt: true,
      recipientLabelPurchasedAt: true,
      proposerLabelUrl: true,
      recipientLabelUrl: true,
      proposerTrackingNumber: true,
      recipientTrackingNumber: true,
      proposerShippedAt: true,
      recipientShippedAt: true,
      proposerReceivedAt: true,
      recipientReceivedAt: true,
      proposerDepositPaidAt: true,
      recipientDepositPaidAt: true,
    },
  });
}

/** Viewer marks that they shipped their outbound package (label required). */
export async function markTradePartyShipped(input: {
  tradeOfferId: string;
  actorUserId: string;
}): Promise<TradeFulfillmentResult> {
  const offer = await loadOffer(input.tradeOfferId);
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };
  if (offer.status === "disputed") {
    return { ok: false, error: "This trade is disputed — shipping updates are paused until it's resolved.", status: 409 };
  }
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Shipping steps are only available after the offer is accepted.", status: 409 };
  }

  const isProposer = offer.proposerId === input.actorUserId;
  const isRecipient = offer.recipientId === input.actorUserId;
  if (!isProposer && !isRecipient) {
    return { ok: false, error: "Only trade participants can mark shipped.", status: 403 };
  }

  const already = isProposer ? offer.proposerShippedAt : offer.recipientShippedAt;
  if (already) return { ok: true, alreadyDone: true, completed: offer.status === "completed" };

  if (!partyHasLabel(offer, isProposer)) {
    return {
      ok: false,
      error: "Buy your shipping label before marking this package as shipped.",
      status: 409,
    };
  }

  const { tradeRequiresSecurityDeposit } = await import("@/lib/trade-security-deposit");
  if (tradeRequiresSecurityDeposit(offer)) {
    const depositPaid = isProposer ? offer.proposerDepositPaidAt : offer.recipientDepositPaidAt;
    if (!depositPaid) {
      return {
        ok: false,
        error: "Pay your refundable security deposit before marking this package as shipped.",
        status: 409,
      };
    }
  }

  const now = new Date();
  const data: Prisma.TradeOfferUpdateInput = isProposer
    ? { proposerShippedAt: now }
    : { recipientShippedAt: now };

  await prisma.$transaction([
    prisma.tradeOffer.update({ where: { id: offer.id }, data }),
    prisma.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "party_shipped",
        actorUserId: input.actorUserId,
        note: JSON.stringify({
          party: isProposer ? "proposer" : "recipient",
          trackingNumber: isProposer ? offer.proposerTrackingNumber : offer.recipientTrackingNumber,
        }),
      },
    }),
  ]);

  return { ok: true, alreadyDone: false, completed: offer.status === "completed" };
}

/**
 * Viewer confirms they received the counterparty's package.
 * When both sides have confirmed receipt, status becomes `completed`.
 */
export async function confirmTradePartyReceived(input: {
  tradeOfferId: string;
  actorUserId: string;
}): Promise<TradeFulfillmentResult> {
  const offer = await loadOffer(input.tradeOfferId);
  if (!offer) return { ok: false, error: "Trade offer not found.", status: 404 };
  if (offer.status === "disputed") {
    return { ok: false, error: "This trade is disputed — receipt confirmation is paused until it's resolved.", status: 409 };
  }
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return { ok: false, error: "Receipt confirmation is only available after the offer is accepted.", status: 409 };
  }

  const isProposer = offer.proposerId === input.actorUserId;
  const isRecipient = offer.recipientId === input.actorUserId;
  if (!isProposer && !isRecipient) {
    return { ok: false, error: "Only trade participants can confirm receipt.", status: 403 };
  }

  const already = isProposer ? offer.proposerReceivedAt : offer.recipientReceivedAt;
  if (already) {
    return { ok: true, alreadyDone: true, completed: offer.status === "completed" };
  }

  const partnerShipped = isProposer ? offer.recipientShippedAt : offer.proposerShippedAt;
  if (!partnerShipped) {
    return {
      ok: false,
      error: "Wait until your partner marks their package as shipped before confirming receipt.",
      status: 409,
    };
  }

  const now = new Date();
  const nextProposerReceived = isProposer ? now : offer.proposerReceivedAt;
  const nextRecipientReceived = isProposer ? offer.recipientReceivedAt : now;
  const bothReceived = Boolean(nextProposerReceived && nextRecipientReceived);
  const shouldComplete = bothReceived && offer.status === "accepted";

  await prisma.$transaction(async (tx) => {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: {
        ...(isProposer ? { proposerReceivedAt: now } : { recipientReceivedAt: now }),
        ...(shouldComplete ? { status: "completed" } : {}),
      },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "party_received",
        actorUserId: input.actorUserId,
        note: JSON.stringify({ party: isProposer ? "proposer" : "recipient" }),
      },
    });
    if (shouldComplete) {
      await tx.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "offer_completed",
          actorUserId: input.actorUserId,
          note: JSON.stringify({ reason: "both_parties_confirmed_receipt" }),
        },
      });
    }
  });

  if (shouldComplete) {
    try {
      const { releaseTradeCashEscrow } = await import("@/lib/trade-cash-escrow");
      await releaseTradeCashEscrow({
        tradeOfferId: offer.id,
        actorUserId: input.actorUserId,
        reason: "both_confirmed_receipt",
      });
    } catch (e) {
      console.error("[trade-fulfillment] cash release after complete failed", offer.id, e);
    }
    try {
      const { refundTradeSecurityDeposits } = await import("@/lib/trade-deposit-checkout");
      await refundTradeSecurityDeposits({
        tradeOfferId: offer.id,
        actorUserId: input.actorUserId,
        reason: "both_confirmed_receipt",
      });
    } catch (e) {
      console.error("[trade-fulfillment] deposit refund after complete failed", offer.id, e);
    }
  }

  return { ok: true, alreadyDone: false, completed: shouldComplete || offer.status === "completed" };
}
