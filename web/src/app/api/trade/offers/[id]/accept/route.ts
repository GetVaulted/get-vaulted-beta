import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction } from "../_shared";
import { isTradeListingAvailableStatus, TRADE_ACTIVE_STATUSES } from "@/lib/trade-offers";
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

    // Lock every listing in this trade so it can't ALSO be accepted into a second, different trade
    // offer (or bought/won on the marketplace) after this one accepts — nothing previously changed
    // listing status on trade acceptance, so the same card could be traded away twice. The read-then-
    // check loop above gives a clear per-listing error in the common case; this CAS `updateMany`
    // (status still in the where clause) is what actually closes the race for two acceptances
    // landing at nearly the same time, mirroring the pattern already used for orders/auctions.
    const listingIds = offer.items.map((item) => item.listingId);
    const locked = await tx.listing.updateMany({
      where: { id: { in: listingIds }, status: { in: ["active", "auction_live"] } },
      data: { status: "sold" },
    });
    if (locked.count !== listingIds.length) {
      return { error: "One or more listings are unavailable now.", code: 409 as const };
    }

    // CAS guard: the checks above (`ensureOfferFreshForAction` / `assertActiveForMutation`) can
    // pass for two concurrent requests (e.g. accept + decline, or a double-tap) before either
    // commits. A plain `update` by id has no re-check and would let both writes "succeed",
    // leaving the offer accepted AND declined. `updateMany` with the status still in the where
    // clause makes the second writer's transition a no-op (mirrors `expireOfferIfNeeded`).
    const transitioned = await tx.tradeOffer.updateMany({
      where: { id: offer.id, status: { in: TRADE_ACTIVE_STATUSES } },
      data: { status: "accepted" },
    });
    if (transitioned.count === 0) {
      return { error: "This offer is no longer active.", code: 409 as const };
    }
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
