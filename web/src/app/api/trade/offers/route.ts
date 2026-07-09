import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import { expireOfferIfNeeded } from "@/lib/trade-offers";
import { notifyTradeOfferCreated } from "@/lib/trade-offer-notifications";
import { checkRateLimit } from "@/lib/request-rate-limit";
import {
  assertTradeOfferListingAllowed,
  CommerceGuardError,
  commerceGuardErrorToHttp,
  loadListingCommerceContext,
} from "@/lib/marketplace/commerce-guards";

type CreateTradeOfferBody = {
  requestedListingIds?: unknown;
  offeredListingIds?: unknown;
  proposerCashUsd?: unknown;
  recipientCashUsd?: unknown;
  messageToRecipient?: unknown;
  expiresAt?: unknown;
};

function asListingIdArray(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out = input.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  return out;
}

function isAvailableStatus(status: string): boolean {
  return status === "active" || status === "auction_live";
}

function toNonNegative(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const limiter = checkRateLimit(`trade:create:${auth.userId}`, { limit: 8, windowMs: 60_000 });
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "You're sending offers too quickly. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: CreateTradeOfferBody;
  try {
    body = (await req.json()) as CreateTradeOfferBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const proposerId = auth.userId;
  const requestedListingIds = asListingIdArray(body.requestedListingIds);
  const offeredListingIds = asListingIdArray(body.offeredListingIds);
  if (!requestedListingIds || !offeredListingIds) {
    return NextResponse.json({ error: "Requested and offered items are required." }, { status: 400 });
  }
  if (requestedListingIds.length < 1 || requestedListingIds.length > 5) {
    return NextResponse.json({ error: "Requested items must be between 1 and 5." }, { status: 400 });
  }
  if (offeredListingIds.length < 1 || offeredListingIds.length > 5) {
    return NextResponse.json({ error: "Offered items must be between 1 and 5." }, { status: 400 });
  }

  const proposerCashParsed = body.proposerCashUsd == null ? 0 : toNonNegative(body.proposerCashUsd);
  const recipientCashParsed = body.recipientCashUsd == null ? 0 : toNonNegative(body.recipientCashUsd);
  if (proposerCashParsed == null || recipientCashParsed == null) {
    return NextResponse.json({ error: "Cash values must be non-negative." }, { status: 400 });
  }
  const proposerCashUsd = proposerCashParsed;
  const recipientCashUsd = recipientCashParsed;
  if (proposerCashUsd > 0 && recipientCashUsd > 0) {
    return NextResponse.json({ error: "Use one cash direction only." }, { status: 400 });
  }

  const messageToRecipient =
    typeof body.messageToRecipient === "string" && body.messageToRecipient.trim().length > 0
      ? body.messageToRecipient.trim().slice(0, 500)
      : null;

  let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (typeof body.expiresAt === "string" && body.expiresAt.trim().length > 0) {
    const parsed = new Date(body.expiresAt);
    if (!Number.isFinite(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid expiration date." }, { status: 400 });
    }
    const max = Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() <= Date.now() || parsed.getTime() > max) {
      return NextResponse.json({ error: "Expiration must be within 7 days." }, { status: 400 });
    }
    expiresAt = parsed;
  }

  const allIds = Array.from(new Set([...requestedListingIds, ...offeredListingIds]));
  const rows = await prisma.listing.findMany({
    where: { id: { in: allIds } },
    include: {
      seller: { select: { username: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  const requestedRows = requestedListingIds.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => Boolean(v));
  const offeredRows = offeredListingIds.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => Boolean(v));

  if (requestedRows.length !== requestedListingIds.length || offeredRows.length !== offeredListingIds.length) {
    return NextResponse.json({ error: "One or more selected items were not found." }, { status: 400 });
  }

  const requestedOwnerIds = new Set(requestedRows.map((l) => l.sellerId));
  if (requestedOwnerIds.size !== 1) {
    return NextResponse.json({ error: "Requested items must belong to one seller." }, { status: 400 });
  }
  const recipientId = requestedRows[0].sellerId;
  if (!recipientId || recipientId === proposerId) {
    return NextResponse.json({ error: "You cannot create a trade with yourself." }, { status: 400 });
  }

  if (offeredRows.some((l) => l.sellerId !== proposerId)) {
    return NextResponse.json({ error: "You can only offer your own listings." }, { status: 400 });
  }
  if (requestedRows.some((l) => l.sellerId === proposerId)) {
    return NextResponse.json({ error: "Requested items cannot be your own listings." }, { status: 400 });
  }

  for (const listing of [...requestedRows, ...offeredRows]) {
    const ctx = await loadListingCommerceContext(prisma, listing.id);
    if (!ctx) {
      return NextResponse.json({ error: "One or more selected items were not found." }, { status: 400 });
    }
    try {
      assertTradeOfferListingAllowed(ctx, proposerId);
    } catch (e) {
      if (e instanceof CommerceGuardError) {
        const hit = commerceGuardErrorToHttp(e.code);
        return NextResponse.json({ error: hit.error, code: e.code }, { status: hit.status });
      }
      throw e;
    }
  }

  if (requestedRows.some((l) => !l.acceptTradeOffers || !isAvailableStatus(l.status))) {
    return NextResponse.json({ error: "Requested items must be trade-enabled and available." }, { status: 400 });
  }
  if (offeredRows.some((l) => !isAvailableStatus(l.status))) {
    return NextResponse.json({ error: "Offered items must be available." }, { status: 400 });
  }

  const duplicate = await prisma.tradeOffer.findFirst({
    where: {
      proposerId,
      recipientId,
      targetListingId: requestedRows[0].id,
      status: { in: ["pending", "countered"] },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "You already have an active offer for this trade." },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.create({
      data: {
        targetListingId: requestedRows[0].id,
        proposerId,
        recipientId,
        status: "pending",
        proposerCashUsd,
        recipientCashUsd,
        messageToRecipient,
        expiresAt,
      },
    });

    await tx.tradeOfferItem.createMany({
      data: [
        ...requestedRows.map((listing) => ({
          tradeOfferId: offer.id,
          side: "recipient" as const,
          ownerUserId: listing.sellerId,
          listingId: listing.id,
          quantity: 1,
          listingTitleSnapshot: listing.title,
          listingImageUrlSnapshot: listing.images[0]?.url ?? null,
          listingCategorySnapshot: listing.category,
          listingConditionSnapshot: listing.condition,
          listingPriceUsdSnapshot: listing.priceUsd,
        })),
        ...offeredRows.map((listing) => ({
          tradeOfferId: offer.id,
          side: "proposer" as const,
          ownerUserId: listing.sellerId,
          listingId: listing.id,
          quantity: 1,
          listingTitleSnapshot: listing.title,
          listingImageUrlSnapshot: listing.images[0]?.url ?? null,
          listingCategorySnapshot: listing.category,
          listingConditionSnapshot: listing.condition,
          listingPriceUsdSnapshot: listing.priceUsd,
        })),
      ],
    });

    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_created",
        actorUserId: proposerId,
        note: JSON.stringify({
          requestedListingIds: requestedRows.map((r) => r.id),
          offeredListingIds: offeredRows.map((r) => r.id),
          proposerCashUsd,
          recipientCashUsd,
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });

    return offer;
  });

  const proposer = await prisma.user.findUnique({
    where: { id: proposerId },
    select: { username: true },
  });
  await notifyTradeOfferCreated(prisma, {
    offerId: created.id,
    recipientId,
    proposerUsername: proposer?.username ?? null,
    requestedTitle: requestedRows[0].title,
    offeredCount: offeredRows.length,
  });

  return NextResponse.json({ offerId: created.id, redirectTo: `/trade/${encodeURIComponent(created.id)}` });
}

export async function GET(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;
  const rows = await prisma.tradeOffer.findMany({
    where: {
      OR: [{ proposerId: userId }, { recipientId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: {
        select: {
          id: true,
          side: true,
          listingId: true,
          listingTitleSnapshot: true,
          listingImageUrlSnapshot: true,
          listingCategorySnapshot: true,
          listingConditionSnapshot: true,
          listingPriceUsdSnapshot: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  for (const row of rows) {
    await expireOfferIfNeeded(prisma, { id: row.id, status: row.status, expiresAt: row.expiresAt });
  }

  const freshRows = await prisma.tradeOffer.findMany({
    where: {
      OR: [{ proposerId: userId }, { recipientId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: {
        select: {
          id: true,
          side: true,
          listingId: true,
          listingTitleSnapshot: true,
          listingImageUrlSnapshot: true,
          listingCategorySnapshot: true,
          listingConditionSnapshot: true,
          listingPriceUsdSnapshot: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const offers = freshRows.map((offer) => {
    const offered = offer.items.filter((i) => i.side === "proposer");
    const requested = offer.items.filter((i) => i.side === "recipient");
    return {
      id: offer.id,
      status: offer.status,
      proposerId: offer.proposerId,
      recipientId: offer.recipientId,
      proposerUsername: offer.proposer.username,
      recipientUsername: offer.recipient.username,
      counterpartyUsername:
        offer.proposerId === userId ? offer.recipient.username : offer.proposer.username,
      offeredCount: offered.length,
      requestedCount: requested.length,
      offeredValue: offered.reduce((sum, i) => sum + i.listingPriceUsdSnapshot, 0),
      requestedValue: requested.reduce((sum, i) => sum + i.listingPriceUsdSnapshot, 0),
      proposerCashUsd: offer.proposerCashUsd,
      recipientCashUsd: offer.recipientCashUsd,
      messageToRecipient: offer.messageToRecipient,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
      expiresAt: offer.expiresAt?.toISOString() ?? null,
      items: offer.items.map((item) => ({
        id: item.id,
        side: item.side,
        listingId: item.listingId,
        listingTitleSnapshot: item.listingTitleSnapshot,
        listingImageUrlSnapshot: item.listingImageUrlSnapshot,
        listingCategorySnapshot: item.listingCategorySnapshot,
        listingConditionSnapshot: item.listingConditionSnapshot,
        listingPriceUsdSnapshot: item.listingPriceUsdSnapshot,
      })),
    };
  });

  return NextResponse.json({ offers, viewerId: userId });
}
