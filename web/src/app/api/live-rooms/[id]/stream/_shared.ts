import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";
import { formatIvsObsIngestUrl } from "@/lib/ivs-obs-ingest-url";

/** Configured IVS channel latency mode ("LOW" = low-latency HLS), without pulling in the AWS SDK service. */
function configuredLatencyMode(): "LOW" | "NORMAL" {
  const raw = process.env.AWS_IVS_LATENCY_MODE?.trim().toUpperCase();
  return raw === "NORMAL" ? "NORMAL" : "LOW";
}

export type StreamRow = {
  id: string;
  streamProvider: string;
  streamMode: string;
  streamHealth: string;
  streamPaused: boolean;
  ivsPlaybackUrl: string | null;
  ivsIngestEndpoint: string | null;
  ivsChannelArn: string | null;
  ivsChannelName: string | null;
  ivsStreamKeyArn: string | null;
  ivsStreamKeyCreatedAt: Date | null;
  ivsStageArn: string | null;
  streamStartedAt: Date | null;
  streamEndedAt: Date | null;
  lastIvsStatusSyncAt: Date | null;
  lastIvsError: string | null;
};

export async function getStreamRow(liveRoomId: string): Promise<StreamRow | null> {
  return prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      streamProvider: true,
      streamMode: true,
      streamHealth: true,
      streamPaused: true,
      ivsPlaybackUrl: true,
      ivsIngestEndpoint: true,
      ivsChannelArn: true,
      ivsChannelName: true,
      ivsStreamKeyArn: true,
      ivsStreamKeyCreatedAt: true,
      ivsStageArn: true,
      streamStartedAt: true,
      streamEndedAt: true,
      lastIvsStatusSyncAt: true,
      lastIvsError: true,
    },
  });
}

export function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

export function toBuyerSafeStreamPayload(row: StreamRow) {
  return {
    roomId: row.id,
    streamProvider: row.streamProvider,
    // Delivery mode: `stage_webrtc` (sub-second WebRTC) vs `channel_hls` (HLS/OBS path).
    streamMode: row.streamMode,
    // Whether a Real-Time Stage exists for this room (gates the client's WebRTC subscribe attempt).
    // No ARN is exposed — buyers fetch a subscribe-only token from the stage-token endpoint.
    stageAvailable: Boolean(row.ivsStageArn),
    streamHealth: row.streamHealth,
    streamPaused: row.streamPaused,
    playbackUrl: row.ivsPlaybackUrl,
    streamStartedAt: toIso(row.streamStartedAt),
    streamEndedAt: toIso(row.streamEndedAt),
    lastStatusSyncAt: toIso(row.lastIvsStatusSyncAt),
    // Configured channel latency mode (LOW = low-latency HLS). Surfaced for client diagnostics.
    latencyMode: configuredLatencyMode(),
  };
}

export function toHostStreamPayload(row: StreamRow) {
  return {
    ...toBuyerSafeStreamPayload(row),
    // OBS Custom service needs rtmps://host:443/app/ — never the bare AWS ingest host.
    ingestEndpoint: formatIvsObsIngestUrl(row.ivsIngestEndpoint),
    channelArn: row.ivsChannelArn,
    channelName: row.ivsChannelName,
    streamKeyArn: row.ivsStreamKeyArn,
    streamKeyCreatedAt: toIso(row.ivsStreamKeyCreatedAt),
    lastIvsError: row.lastIvsError,
  };
}

export async function requireHostAccess(liveRoomId: string, request: Request) {
  const auth = await requireLiveRoomHostAccess(liveRoomId, request);
  if (!auth.ok) return auth;
  return { ok: true as const, userId: auth.userId, access: auth.access };
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to process stream request.";
  const status = message.includes("not configured") ? 503 : 500;
  return NextResponse.json({ error: message }, { status });
}
