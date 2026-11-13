import { prisma } from "@/lib/prisma";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { stopAgoraRelay } from "@/services/agora-rtc";
import {
  createCloudflareLiveInput,
  deleteCloudflareLiveInput,
  getCloudflareLiveInput,
  getCloudflareStreamStatus,
} from "@/services/cloudflare-stream";

export type CloudflareProvisionResult = {
  roomId: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKeyValue: string;
};

/**
 * Point a room at Cloudflare Stream (RTMPS ingest -> HLS). Idempotent: an already-provisioned room
 * gets its existing input back. `fresh: true` replaces the input (new stream key + playback URL).
 * Any IVS Stage / channel references are cleared so buyer clients take the plain HLS path.
 */
export async function provisionCloudflareRoomStream(
  roomId: string,
  opts: { fresh?: boolean } = {},
): Promise<CloudflareProvisionResult> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { id: true, streamProvider: true, externalStreamId: true, externalRelayId: true },
  });
  if (!room) throw new Error("Live room not found.");

  const existingUid = room.streamProvider === "cloudflare_stream" ? room.externalStreamId : null;
  if (existingUid && !opts.fresh) {
    try {
      const input = await getCloudflareLiveInput(existingUid);
      return { roomId, playbackUrl: input.playbackUrl, ingestEndpoint: input.rtmpsUrl, streamKeyValue: input.streamKey };
    } catch (e) {
      // Input was deleted on Cloudflare's side — fall through and create a new one.
      logIvsOpsServer("cloudflare_input_missing_recreate", { roomId, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  const input = await createCloudflareLiveInput(roomId);
  // A new input has a new stream key, so any relay still pushing to the old one is stale.
  if (room.externalRelayId) await stopAgoraRelay(room.externalRelayId);
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      streamProvider: "cloudflare_stream",
      streamMode: "channel_hls",
      streamHealth: "offline",
      externalStreamId: input.uid,
      externalRelayId: null,
      phoneRelay: false,
      ivsPlaybackUrl: input.playbackUrl,
      ivsIngestEndpoint: input.rtmpsUrl,
      ivsStreamKeyCreatedAt: now,
      ivsChannelArn: null,
      ivsChannelName: null,
      ivsStageArn: null,
      ivsCompositionArn: null,
      ivsStreamKeyArn: null,
      streamEndedAt: now,
      streamStartedAt: null,
      lastIvsStatusSyncAt: now,
      lastIvsError: null,
    },
  });
  if (existingUid && existingUid !== input.uid) void deleteCloudflareLiveInput(existingUid);
  logIvsOpsServer("cloudflare_provision_success", { roomId, fresh: Boolean(opts.fresh) });
  return { roomId, playbackUrl: input.playbackUrl, ingestEndpoint: input.rtmpsUrl, streamKeyValue: input.streamKey };
}

/** Poll Cloudflare for ingest status and reconcile `LiveRoom.streamHealth` (same commit path as IVS). */
export async function syncLiveRoomStreamFromCloudflare(liveRoomId: string) {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { id: true, streamProvider: true, externalStreamId: true },
  });
  if (!room || room.streamProvider !== "cloudflare_stream" || !room.externalStreamId) return null;

  const status = await getCloudflareStreamStatus(room.externalStreamId);
  if (status.probeFailed) {
    logIvsOpsServer("cloudflare_stream_sync_skipped_probe_failed", { roomId: liveRoomId });
    return null;
  }
  const { commitLiveRoomStreamHealthFromIvs } = await import("@/services/ivs");
  const result = await commitLiveRoomStreamHealthFromIvs({
    liveRoomId,
    newHealth: status.health,
    opSource: "sync_get_stream",
  });
  if (status.health === "live") {
    const { maybeAutoStartObsRoomOnIngestSignal } = await import("@/lib/live-obs-auto-start");
    await maybeAutoStartObsRoomOnIngestSignal(liveRoomId).catch((e) =>
      console.error("[cloudflare] obs auto-start failed", liveRoomId, e),
    );
  }
  return result;
}

/** Show ended: stop billing for storage by deleting the input and its recording. Never throws. */
export async function teardownCloudflareRoomStream(roomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { externalStreamId: true, externalRelayId: true },
  });
  if (room?.externalRelayId) await stopAgoraRelay(room.externalRelayId);
  if (room?.externalStreamId) await deleteCloudflareLiveInput(room.externalStreamId);
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { externalRelayId: null, streamHealth: "ended", streamEndedAt: now, streamPaused: false, lastIvsStatusSyncAt: now },
  });
}
