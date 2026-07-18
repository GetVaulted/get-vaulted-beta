import { prisma } from "@/lib/prisma";
import { countStagePublishers, endHostStageSession } from "@/services/ivs";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { liveShowEndGmvFields } from "@/lib/live-show-gmv";
import { finalizeLiveStreamReplay } from "@/lib/trust/live-replay-service";
import {
  emitAuctionEnded,
  emitLiveDiscoveryChanged,
} from "@/lib/realtime-emit-server";
import {
  STUCK_LIVE_GRACE_MS,
  decideStuckLiveAction,
  type StuckLiveAction,
} from "@/lib/live-stuck-recovery";

export type StuckLiveRecoverySummary = {
  scanned: number;
  healthy: number;
  warmingOrWaiting: number;
  unknown: number;
  warned: number;
  autoEnded: number;
  endedRoomIds: string[];
};

/** Master kill switch — set to "false" to disable zombie-live recovery entirely. */
function recoveryEnabled(): boolean {
  return process.env.LIVE_STUCK_RECOVERY_ENABLED?.trim().toLowerCase() !== "false";
}

/** Set to "false" to run in observability-only mode (warn but never auto-end). */
function autoEndEnabled(): boolean {
  return process.env.LIVE_STUCK_AUTO_END_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * Force-end an abandoned live room (mirrors the admin `end` action). Safe under concurrency:
 * only transitions rooms still in `live`.
 */
async function autoEndRoom(roomId: string, completedSalesGmvUsd: number): Promise<boolean> {
  const ended = await prisma.liveRoom.updateMany({
    where: { id: roomId, status: "live" },
    data: {
      status: "ended",
      endedAt: new Date(),
      hostAbsentSince: null,
      ...liveShowEndGmvFields(completedSalesGmvUsd),
      roomVersion: { increment: 1 },
    },
  });
  if (ended.count === 0) return false;

  const roomNow = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { roomVersion: true },
  });
  emitAuctionEnded(roomId, roomNow?.roomVersion);
  emitLiveDiscoveryChanged({ roomId, status: "ended", reason: "ended" });
  // status is now `ended`, so this performs the hard stage/composition teardown.
  void endHostStageSession(roomId).catch((e) =>
    console.error("[live-stuck-recovery] stage teardown", roomId, e),
  );
  void finalizeLiveStreamReplay(roomId).catch((e) =>
    console.error("[live-stuck-recovery] replay", roomId, e),
  );
  return true;
}

/**
 * Sweep `live` WebRTC rooms for zombies (host publisher dropped and never returned) and recover them.
 * Idempotent and safe to run on a short schedule (recommended: every 60s). Never throws per-room.
 */
export async function recoverStuckLiveRooms(): Promise<StuckLiveRecoverySummary> {
  const summary: StuckLiveRecoverySummary = {
    scanned: 0,
    healthy: 0,
    warmingOrWaiting: 0,
    unknown: 0,
    warned: 0,
    autoEnded: 0,
    endedRoomIds: [],
  };
  if (!recoveryEnabled()) return summary;

  const rooms = await prisma.liveRoom.findMany({
    where: { status: "live", streamMode: "stage_webrtc", ivsStageArn: { not: null } },
    select: {
      id: true,
      ivsStageArn: true,
      streamStartedAt: true,
      hostAbsentSince: true,
      completedSalesGmvUsd: true,
    },
  });

  for (const room of rooms) {
    summary.scanned += 1;
    if (!room.ivsStageArn) continue;

    try {
      const now = Date.now();
      const msSinceStreamStart = room.streamStartedAt
        ? now - room.streamStartedAt.getTime()
        : Number.POSITIVE_INFINITY;

      const publishers = await countStagePublishers(room.ivsStageArn);
      if (publishers === null) {
        // Couldn't determine — never act on uncertain data.
        summary.unknown += 1;
        continue;
      }

      const hasPublisher = publishers > 0;

      if (hasPublisher) {
        if (room.hostAbsentSince) {
          await prisma.liveRoom
            .update({ where: { id: room.id }, data: { hostAbsentSince: null } })
            .catch(() => {});
        }
        summary.healthy += 1;
        continue;
      }

      // No publisher. Give the show a grace window right after go-live before even marking absence.
      if (msSinceStreamStart < STUCK_LIVE_GRACE_MS) {
        summary.warmingOrWaiting += 1;
        continue;
      }

      // First confirmed absence → stamp it so subsequent passes can measure duration.
      const absentSince = room.hostAbsentSince ?? new Date(now);
      if (!room.hostAbsentSince) {
        await prisma.liveRoom
          .update({ where: { id: room.id }, data: { hostAbsentSince: absentSince } })
          .catch(() => {});
      }
      const msSincePublisherAbsent = now - absentSince.getTime();

      let action: StuckLiveAction = decideStuckLiveAction({
        hasPublisher: false,
        msSinceStreamStart,
        msSincePublisherAbsent,
      });
      if (action === "auto_end" && !autoEndEnabled()) action = "warn_rejoin";

      if (action === "auto_end") {
        const didEnd = await autoEndRoom(room.id, room.completedSalesGmvUsd);
        if (didEnd) {
          summary.autoEnded += 1;
          summary.endedRoomIds.push(room.id);
          logIvsOpsServer("ivs_stuck_live_auto_ended", {
            roomId: room.id,
            msSincePublisherAbsent,
          });
        }
      } else if (action === "warn_rejoin") {
        summary.warned += 1;
        logIvsOpsServer("ivs_stuck_live_host_absent", {
          roomId: room.id,
          msSincePublisherAbsent,
        });
      } else {
        summary.warmingOrWaiting += 1;
      }
    } catch (e) {
      console.error("[live-stuck-recovery] room sweep failed", room.id, e);
    }
  }

  return summary;
}
