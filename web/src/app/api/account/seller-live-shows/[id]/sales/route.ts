import { NextResponse } from "next/server";
import { fetchHostRecentSales } from "@/lib/live-room-recent-sales";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawId);

  const room = await prisma.liveRoom.findFirst({
    where: { id: liveRoomId, sellerId: auth.userId },
    select: { id: true, title: true, status: true },
  });
  if (!room) {
    return NextResponse.json({ error: "Live show not found." }, { status: 404 });
  }

  const sales = await fetchHostRecentSales(liveRoomId, auth.userId);
  return NextResponse.json({
    show: {
      id: room.id,
      title: room.title,
      status: room.status,
    },
    sales,
  });
}
