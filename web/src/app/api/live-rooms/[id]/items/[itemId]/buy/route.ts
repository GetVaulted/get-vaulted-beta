import { NextResponse } from "next/server";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { getLiveBuyerCommerceBlock, getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import { liveRoomPaymentBlockResponse } from "@/lib/live-room-payment-failure";
import { settleLiveBuyNowPurchase } from "@/lib/live-payment-pipeline";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { syncLiveBuyNowOrderPaymentIntent } from "@/lib/stripe-charge-order-saved-pm";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

function stripePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
}

type Body = {
  paymentMethodId?: unknown;
  action?: unknown;
  orderId?: unknown;
};

/** Instant saved-card buy-now for live lineup items (pinned or queued). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  // Cookie session (web) or Supabase Bearer (mobile) — same as bid / variant purchase.
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const buyerId = auth.userId;

  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const itemId = decodeURIComponent(rawItem);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, roomType: true, status: true, streamHealth: true, streamPaused: true, streamMode: true, streamStartedAt: true, streamEndedAt: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  // Buy Now works wherever a fixed-price lot is listed — sale, auction, or break/PYT/PYD show.
  // The listing-format guard in `createLiveBuyNowOrder` (buyingFormat === "buy_now") is what keeps
  // auction lots and variant boards out of this path, so no room-type gate is needed here.
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock(room);
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: { id: true, listingId: true, status: true, title: true },
  });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  // Buy Now items are shoppable from the lineup at any time, not only when the host has pinned
  // them on screen (`active`). Queued Buy Now lots are fair game; only truly-unavailable states
  // (sold, skipped) are blocked. Listing-level guards below still enforce buy-now + availability.
  if (item.status !== "active" && item.status !== "queued") {
    return NextResponse.json({ error: "This item is no longer available." }, { status: 409 });
  }

  const paymentBlock = await liveRoomPaymentBlockResponse(liveRoomId, buyerId);
  if (paymentBlock) return paymentBlock;

  const commerceBlock = await getLiveBuyerCommerceBlock({ liveRoomId, userId: buyerId });
  if (commerceBlock) {
    return NextResponse.json({ error: commerceBlock.error, code: commerceBlock.code }, { status: commerceBlock.status });
  }

  if (!item.listingId) {
    return NextResponse.json(
      { error: "This slot is not linked to checkout yet. Ask the host in chat." },
      { status: 422 },
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body ok */
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;

  if (action === "sync") {
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) return NextResponse.json({ error: "orderId is required." }, { status: 400 });
    const sync = await syncLiveBuyNowOrderPaymentIntent({
      buyerId,
      orderId,
      liveRoomId,
      liveRoomItemId: itemId,
    });
    if (sync.outcome === "paid") {
      return NextResponse.json({ ok: true, paid: true, orderId });
    }
    if (sync.outcome === "requires_action") {
      return NextResponse.json({
        ok: true,
        requiresAction: true,
        orderId,
        clientSecret: sync.clientSecret,
        paymentIntentId: sync.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    return NextResponse.json(
      {
        error: "Payment not completed.",
        code: sync.outcome === "error" ? sync.code : "PAYMENT_NOT_COMPLETED",
        paymentFailed: true,
      },
      { status: 402 },
    );
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(buyerId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  const settled = await settleLiveBuyNowPurchase({
    buyerId,
    liveRoomId,
    liveRoomItemId: itemId,
    paymentMethodId,
  });

  if (settled.ok && "paid" in settled && settled.paid) {
    return NextResponse.json({ ok: true, paid: true, orderId: settled.orderId });
  }
  if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
    return NextResponse.json({
      ok: true,
      requiresAction: true,
      orderId: settled.orderId,
      clientSecret: settled.clientSecret,
      paymentIntentId: settled.paymentIntentId,
      publishableKey: stripePublishableKey(),
    });
  }
  if (settled.ok && "processing" in settled && settled.processing) {
    return NextResponse.json({ ok: true, processing: true, orderId: settled.orderId });
  }
  if (!settled.ok && "paymentFailed" in settled && settled.paymentFailed) {
    return NextResponse.json(
      {
        error: settled.message,
        code: settled.code,
        paymentFailed: true,
        orderId: settled.orderId,
      },
      { status: 402 },
    );
  }
  if (!settled.ok && !("paymentFailed" in settled && settled.paymentFailed)) {
    return NextResponse.json({ error: settled.message, code: settled.code }, { status: 400 });
  }

  return NextResponse.json({ error: "Could not complete purchase." }, { status: 500 });
}
