import { NextResponse } from "next/server";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { getLiveBuyerPaymentSessionState } from "@/lib/live-payment-pipeline";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { isStripeConfigured } from "@/lib/stripe";

type Body = {
  paymentMethodId?: unknown;
};

/** Buyer wallet / active payment method for a live room (saved-card pipeline; preauth scaffolded). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (room.sellerId === auth.userId) {
    return NextResponse.json({
      payment: {
        liveRoomPaymentReady: true,
        paymentReady: true,
        shippingReady: true,
        activePaymentMethodId: null,
        preauthorizationStatus: "none",
        paymentFailureState: null,
      },
    });
  }

  const state = await getLiveBuyerPaymentSessionState({
    buyerId: auth.userId,
    liveRoomId,
  });

  return NextResponse.json({ payment: state });
}

/** Update active saved payment method for this live session (re-validates wallet; preauth scaffolded). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.sellerId === auth.userId) {
    return NextResponse.json({ error: "Hosts do not need buyer payment setup." }, { status: 400 });
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(auth.userId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty ok */
  }

  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : null;

  const state = await getLiveBuyerPaymentSessionState({
    buyerId: auth.userId,
    liveRoomId,
    preferredPaymentMethodId: paymentMethodId,
  });

  if (paymentMethodId && !state.activePaymentMethodId) {
    return NextResponse.json({ error: "That payment method is not available on your account." }, { status: 400 });
  }

  return NextResponse.json({ payment: state });
}
