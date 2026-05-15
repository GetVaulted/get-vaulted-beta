import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction } from "../_shared";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = session.user.id;

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

    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: { status: "declined" },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_declined",
        actorUserId: userId,
        note: JSON.stringify({ declinedAt: new Date().toISOString() }),
      },
    });
    return { ok: true as const };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ ok: true });
}
