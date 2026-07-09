import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { prisma } from "@/lib/prisma";
import { assertActiveForMutation, ensureOfferFreshForAction, resolveTradeListingsForTerms } from "../_shared";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { notifyTradeOfferCountered } from "@/lib/trade-offer-notifications";

type CounterBody = {
  requestedListingIds?: unknown;
  offeredListingIds?: unknown;
  proposerCashUsd?: unknown;
  recipientCashUsd?: unknown;
  messageToRecipient?: unknown;
  expiresAt?: unknown;
};

function asListingIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  return ids;
}

function toNonNegative(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = auth.userId;
  const limiter = checkRateLimit(`trade:counter:${userId}:${offerId}`, { limit: 5, windowMs: 60_000 });
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "You're sending counters too quickly. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: CounterBody;
  try {
    body = (await req.json()) as CounterBody;
  } catch {
    body = {};
  }

  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({
      where: { id: offerId },
      include: { items: true },
    });
    if (!offer) return { error: "Offer not found.", code: 404 as const };
    const isParticipant = offer.proposerId === userId || offer.recipientId === userId;
    if (!isParticipant) return { error: "Only participants can counter.", code: 403 as const };

    const freshStatus = await ensureOfferFreshForAction(tx, {
      id: offer.id,
      status: offer.status,
      expiresAt: offer.expiresAt,
    });
    const transition = assertActiveForMutation(freshStatus);
    if (!transition.ok) return { error: transition.error, code: transition.code as 409 | 400 };

    const currentRequestedIds = offer.items.filter((i) => i.side === "recipient").map((i) => i.listingId);
    const currentOfferedIds = offer.items.filter((i) => i.side === "proposer").map((i) => i.listingId);
    const requestedListingIds = asListingIds(body.requestedListingIds) ?? currentRequestedIds;
    const offeredListingIds = asListingIds(body.offeredListingIds) ?? currentOfferedIds;

    const parsedProposerCashUsd = body.proposerCashUsd == null ? null : toNonNegative(body.proposerCashUsd);
    const parsedRecipientCashUsd = body.recipientCashUsd == null ? null : toNonNegative(body.recipientCashUsd);
    if (parsedProposerCashUsd == null && body.proposerCashUsd != null) {
      return { error: "Cash values must be non-negative.", code: 400 as const };
    }
    if (parsedRecipientCashUsd == null && body.recipientCashUsd != null) {
      return { error: "Cash values must be non-negative.", code: 400 as const };
    }
    const proposerCashUsd = parsedProposerCashUsd ?? offer.proposerCashUsd;
    const recipientCashUsd = parsedRecipientCashUsd ?? offer.recipientCashUsd;
    if (proposerCashUsd > 0 && recipientCashUsd > 0) {
      return { error: "Use one cash direction only.", code: 400 as const };
    }

    const expiresAt = (() => {
      if (typeof body.expiresAt !== "string" || body.expiresAt.trim().length === 0) {
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
      const parsed = new Date(body.expiresAt);
      if (!Number.isFinite(parsed.getTime())) return null;
      return parsed;
    })();
    if (!expiresAt) return { error: "Invalid expiration date.", code: 400 as const };

    const resolved = await resolveTradeListingsForTerms(tx, requestedListingIds, offeredListingIds, offer.proposerId);
    if ("error" in resolved) return { error: resolved.error, code: resolved.status as 400 };

    const previousTerms = {
      requestedListingIds: currentRequestedIds,
      offeredListingIds: currentOfferedIds,
      proposerCashUsd: offer.proposerCashUsd,
      recipientCashUsd: offer.recipientCashUsd,
      messageToRecipient: offer.messageToRecipient,
    };

    await tx.tradeOfferItem.deleteMany({ where: { tradeOfferId: offer.id } });
    await tx.tradeOfferItem.createMany({
      data: [
        ...resolved.requestedRows.map((listing) => ({
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
        ...resolved.offeredRows.map((listing) => ({
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

    await tx.tradeOffer.update({
      where: { id: offer.id },
      data: {
        targetListingId: resolved.requestedRows[0].id,
        recipientId: resolved.recipientId,
        status: "countered",
        proposerCashUsd,
        recipientCashUsd,
        messageToRecipient:
          typeof body.messageToRecipient === "string" && body.messageToRecipient.trim().length > 0
            ? body.messageToRecipient.trim().slice(0, 500)
            : offer.messageToRecipient,
        expiresAt,
      },
    });
    await tx.tradeOfferEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "offer_countered",
        actorUserId: userId,
        note: JSON.stringify({
          previousTerms,
          nextTerms: {
            requestedListingIds: resolved.requestedRows.map((r) => r.id),
            offeredListingIds: resolved.offeredRows.map((r) => r.id),
            proposerCashUsd,
            recipientCashUsd,
            expiresAt: expiresAt.toISOString(),
          },
        }),
      },
    });
    return {
      ok: true as const,
      notifyUserId: offer.proposerId === userId ? offer.recipientId : offer.proposerId,
    };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  await notifyTradeOfferCountered(prisma, {
    offerId,
    recipientUserId: result.notifyUserId,
    actorUsername: actor?.username ?? null,
  });

  return NextResponse.json({ ok: true });
}
