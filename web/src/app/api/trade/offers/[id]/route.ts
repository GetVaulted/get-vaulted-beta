import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import { expireOfferIfNeeded } from "@/lib/trade-offers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = auth.userId;
  const session = await getServerSessionSafe();

  const offer = await prisma.tradeOffer.findUnique({
    where: { id: offerId },
    include: {
      proposer: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
      items: { orderBy: { createdAt: "asc" } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actorUser: { select: { username: true } } },
      },
    },
  });
  if (!offer) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const isParticipant = offer.proposerId === userId || offer.recipientId === userId;
  const isAdmin = session?.user?.role === "admin";
  if (!isParticipant && !isAdmin) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await expireOfferIfNeeded(prisma, { id: offer.id, status: offer.status, expiresAt: offer.expiresAt });
  const fresh = await prisma.tradeOffer.findUnique({
    where: { id: offerId },
    include: {
      proposer: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
      items: { orderBy: { createdAt: "asc" } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actorUser: { select: { username: true } } },
      },
    },
  });
  if (!fresh) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    offer: {
      id: fresh.id,
      status: fresh.status,
      proposerId: fresh.proposerId,
      recipientId: fresh.recipientId,
      proposerUsername: fresh.proposer.username,
      recipientUsername: fresh.recipient.username,
      proposerCashUsd: fresh.proposerCashUsd,
      recipientCashUsd: fresh.recipientCashUsd,
      messageToRecipient: fresh.messageToRecipient,
      expiresAt: fresh.expiresAt?.toISOString() ?? null,
      createdAt: fresh.createdAt.toISOString(),
      updatedAt: fresh.updatedAt.toISOString(),
      items: fresh.items.map((item) => ({
        id: item.id,
        side: item.side,
        listingId: item.listingId,
        listingTitleSnapshot: item.listingTitleSnapshot,
        listingImageUrlSnapshot: item.listingImageUrlSnapshot,
        listingCategorySnapshot: item.listingCategorySnapshot,
        listingConditionSnapshot: item.listingConditionSnapshot,
        listingPriceUsdSnapshot: item.listingPriceUsdSnapshot,
      })),
      events: fresh.events.map((evt) => ({
        id: evt.id,
        type: evt.type,
        note: evt.note,
        actorUsername: evt.actorUser?.username ?? null,
        createdAt: evt.createdAt.toISOString(),
      })),
    },
  });
}
