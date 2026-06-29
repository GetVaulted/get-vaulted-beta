import type { LiveRoomStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type SellerAccountLiveShowRow = {
  id: string;
  title: string;
  status: LiveRoomStatus;
  scheduledStartAt: string | null;
  startedAt: string | null;
  updatedAt: string;
};

const STATUS_RANK: Record<LiveRoomStatus, number> = {
  live: 0,
  scheduled: 1,
  ended: 2,
};

/** Seller account picker — live first, then scheduled, then recent ended shows. */
export async function listSellerAccountLiveShows(sellerId: string): Promise<SellerAccountLiveShowRow[]> {
  const rows = await prisma.liveRoom.findMany({
    where: { sellerId },
    orderBy: [{ updatedAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledStartAt: true,
      startedAt: true,
      updatedAt: true,
    },
  });

  return rows
    .map(
      (r): SellerAccountLiveShowRow => ({
        id: r.id,
        title: r.title.trim() || "Live show",
        status: r.status,
        scheduledStartAt: r.scheduledStartAt?.toISOString() ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      }),
    )
    .sort((a, b) => {
      const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rank !== 0) return rank;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}
