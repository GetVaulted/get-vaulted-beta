import { NextResponse } from "next/server";
import { buildLiveRoomShareMetadata } from "@/lib/live-room-share-metadata";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";

/** Public OG/share metadata for crawlers and clients (iMessage, X, Discord, etc.). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const roomId = safeDecodeRouteSegment(id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
  }

  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      title: true,
      category: true,
      thumbnailUrl: true,
      seller: { select: { username: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Live room not found." }, { status: 404 });
  }

  const meta = buildLiveRoomShareMetadata({
    id: row.id,
    title: row.title,
    category: row.category,
    thumbnailUrl: row.thumbnailUrl,
    sellerUsername: row.seller.username,
  });

  return NextResponse.json(meta, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
