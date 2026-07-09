import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction } from "../_shared";
import { isTradeListingAvailableStatus } from "@/lib/trade-offers";
import { notifyTradeOfferAccepted } from "@/lib/trade-offer-notifications";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = auth.userId;

  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({
      where: { id: offerId },
      include: { items: true },
    });
    if (!offer) return { error: "Offer not found.", code: 404 as const };
    const freshStatus = await ensureOfferFreshForAction(tx, {
      id: offer.id,
      status: offer.status,
      expiresAt: offer.expiresAt,
    });
    if (offer.recipientId !== userId) return { error: "Only the receiver can accept.", code: 403 as const };
    const transition = assertActiveForMutation(freshStatus);
    if (!transition.ok) return { error: transition.error, code: transition.code as 409 | 400 };

    const rows = await tx.listing.findMany({
      where: { id: { in: offer.items.map((item) => item.listingId) } },
      select: { id: true, sellerId: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of offer.items) {
      const listing = byId.get(item.listingId);
      if (!listing) return { error: "One or more listings no longer exist.", code: 409 as const };
      if (listing.sellerId !== item.ownerUserId) return { error: "Listing ownership changed.", code: 409 as const };
      if (!isTradeListingAvailableStatus(listing.status)) {
        return { error: "One or more listings are unavailable now.", code: 409 as const };
      }
    }

    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: { status: "accepted" },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_accepted",
        actorUserId: userId,
        note: JSON.stringify({
          validatedListingIds: offer.items.map((i) => i.listingId),
          acceptedAt: new Date().toISOString(),
        }),
      },
    });
    return { ok: true as const, proposerId: offer.proposerId };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  await notifyTradeOfferAccepted(prisma, {
    offerId,
    proposerId: result.proposerId,
    actorUsername: actor?.username ?? null,
  });

  return NextResponse.json({ ok: true });
}
