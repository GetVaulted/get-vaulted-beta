import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction } from "../_shared";
import { TRADE_ACTIVE_STATUSES } from "@/lib/trade-offers";
import { notifyTradeOfferDeclined } from "@/lib/trade-offer-notifications";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = auth.userId;

  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({ where: { id: offerId } });
    if (!offer) return { error: "Offer not found.", code: 404 as const };
    const freshStatus = await ensureOfferFreshForAction(tx, {
      id: offer.id,
      status: offer.status,
      expiresAt: offer.expiresAt,
    });
    if (offer.recipientId !== userId) return { error: "Only the receiver can decline.", code: 403 as const };
    const transition = assertActiveForMutation(freshStatus);
    if (!transition.ok) return { error: transition.error, code: transition.code as 409 | 400 };

    // CAS guard: prevents this transition from "winning" after a concurrent accept/cancel/counter
    // has already moved the offer out of an active status (see accept/route.ts for detail).
    const transitioned = await tx.tradeOffer.updateMany({
      where: { id: offer.id, status: { in: TRADE_ACTIVE_STATUSES } },
      data: { status: "declined" },
    });
    if (transitioned.count === 0) {
      return { error: "This offer is no longer active.", code: 409 as const };
    }
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_declined",
        actorUserId: userId,
        note: JSON.stringify({ declinedAt: new Date().toISOString() }),
      },
    });
    return { ok: true as const, proposerId: offer.proposerId };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  await notifyTradeOfferDeclined(prisma, {
    offerId,
    proposerId: result.proposerId,
    actorUsername: actor?.username ?? null,
  });

  return NextResponse.json({ ok: true });
}
