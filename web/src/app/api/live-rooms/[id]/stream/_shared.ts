import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";

export type StreamRow = {
  id: string;
  streamProvider: string;
  streamHealth: string;
  ivsPlaybackUrl: string | null;
  ivsIngestEndpoint: string | null;
  ivsChannelArn: string | null;
  ivsChannelName: string | null;
  ivsStreamKeyArn: string | null;
  ivsStreamKeyCreatedAt: Date | null;
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
      streamHealth: true,
      ivsPlaybackUrl: true,
      ivsIngestEndpoint: true,
      ivsChannelArn: true,
      ivsChannelName: true,
      ivsStreamKeyArn: true,
      ivsStreamKeyCreatedAt: true,
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
    streamHealth: row.streamHealth,
    playbackUrl: row.ivsPlaybackUrl,
    streamStartedAt: toIso(row.streamStartedAt),
    streamEndedAt: toIso(row.streamEndedAt),
    lastStatusSyncAt: toIso(row.lastIvsStatusSyncAt),
  };
}

export function toHostStreamPayload(row: StreamRow) {
  return {
    ...toBuyerSafeStreamPayload(row),
    ingestEndpoint: row.ivsIngestEndpoint,
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
