import { NextResponse } from "next/server";
import { fetchLiveRoomOgPayload } from "@/lib/live-room-og-payload";
import { buildLiveRoomShareMetadata } from "@/lib/live-room-share-metadata";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";

/** Public OG/share metadata for crawlers and clients (iMessage, X, Discord, etc.). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const roomId = safeDecodeRouteSegment(id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "Invalid room id." }, { status: 400 });
  }

  const payload = await fetchLiveRoomOgPayload(roomId);
  if (!payload) {
    return NextResponse.json({ error: "Live room not found." }, { status: 404 });
  }

  const meta = buildLiveRoomShareMetadata({
    id: payload.id,
    title: payload.showTitle,
    sellerUsername: payload.hostUsername,
    viewerCount: payload.viewerCount,
    isLive: payload.isLive,
  });

  return NextResponse.json(
    {
      ...meta,
      ogImageUrl: payload.ogImageUrl,
      hostUsername: payload.hostUsername,
      hostDisplayName: payload.hostDisplayName,
      showTitle: payload.showTitle,
      viewerCount: payload.viewerCount,
      isLive: payload.isLive,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
