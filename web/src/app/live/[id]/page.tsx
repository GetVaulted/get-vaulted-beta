import type { Metadata } from "next";
import { LiveRoomShell } from "@/components/live-auction/LiveRoomShell";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { liveRoomShareMetadataToNext } from "@/lib/live-room-share-metadata";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const roomId = safeDecodeRouteSegment(id ?? "");
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
    return {
      title: "Live room | Get Vaulted",
      description: "Watch live auctions, breaks, and drops on Get Vaulted.",
    };
  }
  return liveRoomShareMetadataToNext({
    id: row.id,
    title: row.title,
    category: row.category,
    thumbnailUrl: row.thumbnailUrl,
    sellerUsername: row.seller.username,
  });
}

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveRoomShell roomId={safeDecodeRouteSegment(id ?? "")} />;
}
