import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { ensureTradeOfferThread } from "@/lib/message-threads";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { checkRateLimit } from "@/lib/request-rate-limit";

/**
 * POST /api/trade/offers/[id]/conversation
 * Idempotently opens (or returns) the participant-scoped trade chat thread.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`trade-conversation:${auth.userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const { id } = await ctx.params;
  const offerId = decodeURIComponent(id);
  const userId = auth.userId;
  const session = await getServerSessionSafe();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.tradeOffer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          proposerId: true,
          recipientId: true,
          targetListingId: true,
          conversationId: true,
          status: true,
        },
      });
      if (!offer) return { error: "Offer not found.", code: 404 as const };

      const isParticipant = offer.proposerId === userId || offer.recipientId === userId;
      const isAdmin = session?.user?.role === "admin";
      if (!isParticipant && !isAdmin) return { error: "Offer not found.", code: 404 as const };
      if (!isParticipant) return { error: "Only trade participants can open this chat.", code: 403 as const };

      const ensured = await ensureTradeOfferThread(tx, {
        offer: {
          id: offer.id,
          proposerId: offer.proposerId,
          recipientId: offer.recipientId,
          targetListingId: offer.targetListingId,
          conversationId: offer.conversationId,
        },
        actorUserId: userId,
      });
      return {
        ok: true as const,
        threadId: ensured.threadId,
        created: ensured.created,
        conversationId: ensured.threadId,
      };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    return NextResponse.json({
      ok: true,
      threadId: result.threadId,
      conversationId: result.conversationId,
      created: result.created,
      href: `/account/messages/${encodeURIComponent(result.threadId)}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "TRADE_THREAD_FORBIDDEN") {
      return NextResponse.json({ error: "Only trade participants can open this chat." }, { status: 403 });
    }
    console.error("[trade conversation]", e);
    return NextResponse.json({ error: "Could not open trade chat." }, { status: 500 });
  }
}
