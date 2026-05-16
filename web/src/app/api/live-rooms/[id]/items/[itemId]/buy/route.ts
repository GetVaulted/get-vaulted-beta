import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getServerSessionSafe();
  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const itemId = decodeURIComponent(rawItem);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, roomType: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.roomType !== "sale") {
    return NextResponse.json({ error: "Buy now is only available in sale rooms." }, { status: 400 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }

  const item = await prisma.liveRoomItem.findFirst({
    where: { id: itemId, liveRoomId },
    select: { id: true, listingId: true, status: true, title: true },
  });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "active") {
    return NextResponse.json({ error: "Only the active item can be purchased." }, { status: 409 });
  }

  const returnPath = item.listingId
    ? `/checkout/${encodeURIComponent(item.listingId)}?liveItem=${encodeURIComponent(itemId)}&returnLive=${encodeURIComponent(liveRoomId)}`
    : `/live/${encodeURIComponent(liveRoomId)}`;

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to buy.", signInUrl: signInUrl(returnPath) },
      { status: 401 },
    );
  }

  if (room.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot purchase items in your own live room." }, { status: 400 });
  }

  if (!item.listingId) {
    return NextResponse.json(
      { error: "This slot is not linked to checkout yet. Ask the host in chat." },
      { status: 422 },
    );
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(session.user.id);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
  }

  return NextResponse.json({
    checkoutUrl: `/checkout/${encodeURIComponent(item.listingId)}?liveItem=${encodeURIComponent(itemId)}&returnLive=${encodeURIComponent(liveRoomId)}`,
  });
}
