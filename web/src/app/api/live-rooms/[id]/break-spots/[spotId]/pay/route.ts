import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { liveRoomPaymentBlockResponse } from "@/lib/live-room-payment-failure";
import { getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import { settleLiveBreakSpotPayment, syncBreakSpotPaymentIntent } from "@/lib/live-payment-pipeline";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

function stripePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
}

type Body = {
  paymentMethodId?: unknown;
  action?: unknown;
};

/** Instant saved-card payment for a claimed break spot (no Stripe Checkout redirect). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; spotId: string }> },
) {
  const { id: rawRoom, spotId: rawSpot } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const breakSpotId = decodeURIComponent(rawSpot);
  const returnPath = `/live/${encodeURIComponent(liveRoomId)}`;

  const authHeader = req.headers.get("authorization");
  const auth = await resolveLiveRoomsUserId(req);
  let userId: string;
  if (auth instanceof NextResponse) {
    const session = await getServerSessionSafe();
    if (!session?.user?.id) {
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Sign in to pay.", signInUrl: signInUrl(returnPath) }, { status: 401 });
      }
      return auth;
    }
    userId = session.user.id;
  } else {
    userId = auth.userId;
  }

  const paymentBlock = await liveRoomPaymentBlockResponse(liveRoomId, userId);
  if (paymentBlock) return paymentBlock;

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { status: true, streamHealth: true, streamPaused: true, streamMode: true, streamStartedAt: true, streamEndedAt: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock(room, "purchase");
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
  }

  const spot = await prisma.breakSpot.findFirst({
    where: { id: breakSpotId, liveRoomId, userId },
    select: { id: true, claimStatus: true, breakPaymentStatus: true },
  });
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  if (spot.claimStatus === "paid" || spot.breakPaymentStatus === "paid") {
    return NextResponse.json({ ok: true, paid: true });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : undefined;

  if (action === "sync") {
    const sync = await syncBreakSpotPaymentIntent({ buyerId: userId, breakSpotId });
    if (sync.outcome === "paid") {
      return NextResponse.json({ ok: true, paid: true });
    }
    if (sync.outcome === "requires_action") {
      return NextResponse.json({
        ok: true,
        requiresAction: true,
        clientSecret: sync.clientSecret,
        paymentIntentId: sync.paymentIntentId,
        publishableKey: stripePublishableKey(),
      });
    }
    return NextResponse.json(
      {
        error: sync.outcome === "error" ? (sync.message ?? "Payment not completed.") : "Payment not completed.",
        code: sync.outcome === "error" ? sync.code : "PAYMENT_NOT_COMPLETED",
        paymentFailed: true,
      },
      { status: 402 },
    );
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(userId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  const settled = await settleLiveBreakSpotPayment({
    buyerId: userId,
    breakSpotId,
    paymentMethodId,
  });

  if (settled.ok && "paid" in settled && settled.paid) {
    return NextResponse.json({ ok: true, paid: true });
  }
  if (settled.ok && "requiresAction" in settled && settled.requiresAction) {
    return NextResponse.json({
      ok: true,
      requiresAction: true,
      clientSecret: settled.clientSecret,
      paymentIntentId: settled.paymentIntentId,
      publishableKey: stripePublishableKey(),
    });
  }
  if (settled.ok && "processing" in settled && settled.processing) {
    return NextResponse.json({ ok: true, processing: true, paymentIntentId: settled.paymentIntentId });
  }
  if (!settled.ok && "paymentFailed" in settled && settled.paymentFailed) {
    return NextResponse.json(
      { error: settled.message, code: settled.code, paymentFailed: true },
      { status: 402 },
    );
  }
  if (!settled.ok && !("paymentFailed" in settled && settled.paymentFailed)) {
    return NextResponse.json({ error: settled.message, code: settled.code }, { status: 400 });
  }

  return NextResponse.json({ error: "Could not complete payment." }, { status: 500 });
}
