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

  // `shouldComplete` must NOT be computed from the `offer` snapshot read at the top of this
  // function: when both parties confirm receipt in two concurrent requests, each one reads the
  // *other* party's `receivedAt` as still null (neither has committed yet), so each computes
  // `bothReceived = false` and neither ever flips status to "completed" — the trade is stuck in
  // "accepted" forever even though both confirmations did land. Fix: write this party's own
  // confirmation first (which takes Postgres's row lock and serializes with a concurrent
  // confirmation from the other party), then re-read the row's current state *inside the same
  // transaction* before deciding whether both sides are now in. Re-checking `status === "accepted"`
  // on that fresh read (rather than trusting `bothReceived` alone) also keeps a redundant/racing
  // duplicate call from re-firing the completion event and its escrow/deposit side effects below.
  const shouldComplete = await prisma.$transaction(async (tx) => {
    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: isProposer ? { proposerReceivedAt: now } : { recipientReceivedAt: now },
    });

    const fresh = await tx.tradeOffer.findUnique({
      where: { id: offer.id },
      select: { status: true, proposerReceivedAt: true, recipientReceivedAt: true },
    });
    const bothReceived = Boolean(fresh?.proposerReceivedAt && fresh?.recipientReceivedAt);
    const willComplete = bothReceived && fresh?.status === "accepted";

    if (willComplete) {
      await tx.tradeOffer.update({ where: { id: offer.id }, data: { status: "completed" } });
    }

    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "party_received",
        actorUserId: input.actorUserId,
        note: JSON.stringify({ party: isProposer ? "proposer" : "recipient" }),
      },
    });
    if (willComplete) {
      await tx.tradeOfferEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: "offer_completed",
          actorUserId: input.actorUserId,
          note: JSON.stringify({ reason: "both_parties_confirmed_receipt" }),
        },
      });
    }
    return willComplete;
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
