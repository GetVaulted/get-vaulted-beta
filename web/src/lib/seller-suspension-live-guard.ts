import { prisma } from "@/lib/prisma";
import { emitAuctionEnded, emitLiveDiscoveryChanged } from "@/lib/realtime-emit-server";
import { finalizeLiveStreamReplay } from "@/lib/trust/live-replay-service";
import { endHostStageSession } from "@/services/ivs";
import { liveShowEndGmvFields } from "@/lib/live-show-gmv";

/**
 * Chaos engineering deep-dive (2026-07): suspending a seller previously only set `User.suspendedAt`
 * — it blocked the host console (`getLiveRoomHostAccess`) but did nothing to a room already `live`.
 * Bids/buy-now continued to work, funds kept flowing to the suspended seller's Connect account, and
 * buyers were never told anything was wrong. Only a Trust & Safety admin manually calling the
 * existing "end show" action (`/api/admin/live-shows/[id]/actions`) stopped it.
 *
 * This closes that gap the same way an admin already safely ends a show: flip `live` -> `ended` /
 * `scheduled` -> `ended` via the same status-guarded `updateMany` the manual action uses. That
 * transition never touches Orders, payments, or payouts — it only stops *new* bids/buy-now, which
 * already gate on `room.status === "live"`. Payouts to a suspended seller are separately blocked by
 * `instant-payout-eligibility.ts` / `seller-payout-tier.ts`, and existing orders/escrow/refunds are
 * intentionally left untouched here — unwinding in-flight money is a business decision, not
 * something safe to automate on suspension.
 */
export async function endLiveRoomsForSuspendedSeller(
  sellerId: string,
): Promise<{ ended: number; cancelled: number }> {
  const rooms = await prisma.liveRoom.findMany({
    where: { sellerId, status: { in: ["live", "scheduled"] } },
    select: { id: true, status: true, completedSalesGmvUsd: true },
  });

  let ended = 0;
  let cancelled = 0;

  for (const room of rooms) {
    const wasLive = room.status === "live";
    const updated = await prisma.liveRoom.updateMany({
      where: { id: room.id, status: room.status },
      data: {
        status: "ended",
        endedAt: new Date(),
        viewerCount: 0,
        viewerCountUpdatedAt: new Date(),
        // Mirrors the existing manual admin "end"/"cancel" actions exactly (`live-shows/[id]/actions`).
        ...liveShowEndGmvFields(room.completedSalesGmvUsd),
        roomVersion: { increment: 1 },
      },
    });
    if (updated.count === 0) continue;
    if (wasLive) ended += 1;
    else cancelled += 1;

    const roomNow = await prisma.liveRoom.findUnique({ where: { id: room.id }, select: { roomVersion: true } });
    if (wasLive) emitAuctionEnded(room.id, roomNow?.roomVersion);
    emitLiveDiscoveryChanged({ roomId: room.id, status: "ended", reason: wasLive ? "ended" : "cancelled" });
    void endHostStageSession(room.id).catch((e) => console.error("[seller suspend] stage teardown", room.id, e));
    void finalizeLiveStreamReplay(room.id).catch((e) => console.error("[seller suspend] replay finalize", room.id, e));
  }

  return { ended, cancelled };
}
