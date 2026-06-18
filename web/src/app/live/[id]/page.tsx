import type { Metadata } from "next";
import { LiveRoomShell } from "@/components/live-auction/LiveRoomShell";
import { fetchLiveRoomOgPayload } from "@/lib/live-room-og-payload";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { liveRoomShareMetadataToNext } from "@/lib/live-room-share-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const roomId = safeDecodeRouteSegment(id ?? "");
  const payload = await fetchLiveRoomOgPayload(roomId);
  if (!payload) {
    return {
      title: "Live room | Get Vaulted",
      description: "Join the live auction now on Get Vaulted.",
    };
  }
  return liveRoomShareMetadataToNext({
    id: payload.id,
    title: payload.showTitle,
    sellerUsername: payload.hostUsername,
    viewerCount: payload.viewerCount,
  });
}

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveRoomShell roomId={safeDecodeRouteSegment(id ?? "")} />;
}
