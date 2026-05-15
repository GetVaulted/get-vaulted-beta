import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLiveShippingSessionSummary, LIVE_BUNDLED_SHIPPING_DESTINATION_KEY } from "@/services/shipping/live-shipping-pricing";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ session: null });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, sellerId: true, roomType: true },
  });
  if (!room || (room.roomType !== "auction" && room.roomType !== "sale")) {
    return NextResponse.json({ session: null });
  }
  if (room.sellerId === session.user.id) {
    return NextResponse.json({ session: null });
  }

  const shippingSession = await prisma.liveShippingSession.findFirst({
    where: {
      buyerId: session.user.id,
      sellerId: room.sellerId,
      liveShowId: room.id,
      destinationAddressId: LIVE_BUNDLED_SHIPPING_DESTINATION_KEY,
    },
    select: { id: true },
  });
  if (!shippingSession?.id) {
    return NextResponse.json({ session: null });
  }
  const summary = await getLiveShippingSessionSummary(shippingSession.id);
  if (!summary) return NextResponse.json({ session: null });

  return NextResponse.json({
    session: {
      shippingCostCents: summary.shippingCostCents,
      capReached: summary.capReached,
      pricingWeightOz: summary.pricingWeightOz,
    },
  });
}
