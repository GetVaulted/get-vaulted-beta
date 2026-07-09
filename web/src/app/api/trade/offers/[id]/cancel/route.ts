import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction } from "../_shared";
import { notifyTradeOfferCancelled } from "@/lib/trade-offer-notifications";

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
    if (offer.proposerId !== userId) return { error: "Only the sender can cancel.", code: 403 as const };
    const transition = assertActiveForMutation(freshStatus);
    if (!transition.ok) return { error: transition.error, code: transition.code as 409 | 400 };

    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: { status: "cancelled" },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_cancelled",
        actorUserId: userId,
        note: JSON.stringify({ cancelledAt: new Date().toISOString() }),
      },
    });
    return { ok: true as const, recipientId: offer.recipientId };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  await notifyTradeOfferCancelled(prisma, {
    offerId,
    recipientId: result.recipientId,
    actorUsername: actor?.username ?? null,
  });

  return NextResponse.json({ ok: true });
}
