import { prisma } from "@/lib/prisma";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { emitAuctionStarted, emitLiveDiscoveryChanged, emitTeamBoardChanged } from "@/lib/realtime-emit-server";
import { notifyFollowersSellerWentLive } from "@/lib/seller-follow-notify";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { isLiveStreamSignal } from "@/lib/live-stream-playback";

/**
 * When OBS starts pushing into a `channel_hls` room that is still scheduled, promote the room to
 * live so host commerce (pin / start auction) works without tapping Play on the phone.
 *
 * Returns true when the room was started by this call.
 */
export async function maybeAutoStartObsRoomOnIngestSignal(liveRoomId: string): Promise<boolean> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      status: true,
      streamMode: true,
      streamHealth: true,
      sellerId: true,
      roomType: true,
      discoveryVisibility: true,
      teamBoardLeague: true,
    },
  });
  if (!room) return false;
  if (room.status !== "scheduled") return false;
  if (room.streamMode !== "channel_hls") return false;
  if (!isLiveStreamSignal(room.streamHealth)) return false;

  const otherLiveCount = await prisma.liveRoom.count({
    where: { sellerId: room.sellerId, status: "live", NOT: { id: liveRoomId } },
  });
  if (otherLiveCount >= 1) {
    logIvsOpsServer("ivs_obs_auto_start_blocked_other_live", { roomId: liveRoomId });
    return false;
  }

  const readiness = await getSellerLiveReadiness(room.sellerId);
  if (!readiness.canGoLive) {
    logIvsOpsServer("ivs_obs_auto_start_blocked_readiness", {
      roomId: liveRoomId,
      issues: readiness.issues.slice(0, 5),
    });
    return false;
  }

  const started = await prisma.liveRoom.updateMany({
    where: { id: liveRoomId, status: "scheduled" },
    data: {
      status: "live",
      startedAt: new Date(),
      endedAt: null,
      streamEndedAt: null,
      streamPaused: false,
      completedSalesGmvUsd: 0,
      roomVersion: { increment: 1 },
    },
  });
  if (started.count === 0) return false;

  const roomNow = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { roomVersion: true },
  });

  if (room.roomType === "break") {
    await prisma.liveRoomTeamBoard.upsert({
      where: { liveRoomId },
      create: {
        liveRoomId,
        league: room.teamBoardLeague,
        visible: true,
        locked: false,
      },
      update: { visible: true },
    });
    void emitTeamBoardChanged(liveRoomId);
  }

  emitAuctionStarted(liveRoomId, roomNow?.roomVersion);
  if (room.discoveryVisibility !== "private") {
    const seller = await prisma.user.findUnique({
      where: { id: room.sellerId },
      select: { username: true },
    });
    if (seller) {
      void notifyFollowersSellerWentLive(room.sellerId, seller.username, liveRoomId).catch((e) =>
        console.error("[obs-auto-start] notifyFollowersSellerWentLive failed", room.sellerId, e),
      );
    }
  }
  emitLiveDiscoveryChanged({ roomId: liveRoomId, status: "live", reason: "obs_ingest_auto_start" });
  logIvsOpsServer("ivs_obs_auto_start", {
    roomId: liveRoomId,
    streamHealth: room.streamHealth,
  });
  return true;
}
