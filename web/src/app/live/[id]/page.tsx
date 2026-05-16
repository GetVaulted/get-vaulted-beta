import type { Metadata } from "next";
import { LiveRoomShell } from "@/components/live-auction/LiveRoomShell";
import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await prisma.liveRoom.findUnique({
    where: { id: safeDecodeRouteSegment(id ?? "") },
    select: { title: true },
  });
  if (!row) {
    return {
      title: `Live room | Get Vaulted`,
      description: "Live commerce room.",
    };
  }
  return {
    title: `${row.title} | Get Vaulted`,
    description: "Live commerce room on Get Vaulted.",
  };
}

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveRoomShell roomId={safeDecodeRouteSegment(id ?? "")} />;
}
