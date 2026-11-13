import { prisma } from "@/lib/prisma";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import {
  createAgoraHostSession,
  getAgoraRelay,
  isAgoraConfigured,
  joinRtmpUrl,
  startAgoraRelay,
  stopAgoraRelay,
  type AgoraHostSession,
} from "@/services/agora-rtc";
import {
  getCloudflareLiveInput,
  isBackupLiveVideoActive,
  isCloudflareStreamConfigured,
} from "@/services/cloudflare-stream";
import { provisionCloudflareRoomStream } from "@/services/cloudflare-stream-room";

export type HostPublisherKind = "aws_ivs" | "agora";

/**
 * Which sender the seller's phone should use for this room.
 * - A show already running on AWS never moves mid-stream.
 * - A show already running on the phone-relay path keeps it, even if the admin switch flips.
 * - Otherwise the admin switch decides, and only when both Agora and Cloudflare are configured.
 */
export async function resolveHostPublisher(roomId: string): Promise<HostPublisherKind> {
  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, streamHealth: true, phoneRelay: true },
  });
  if (row?.streamProvider === "aws_ivs" && (row.streamHealth === "live" || row.streamHealth === "connecting")) {
    return "aws_ivs";
  }
  if (row?.streamProvider === "cloudflare_stream" && row.phoneRelay) return "agora";
  if (!(await isBackupLiveVideoActive())) return "aws_ivs";
  if (!isAgoraConfigured() || !isCloudflareStreamConfigured()) return "aws_ivs";
  return "agora";
}

/** Provision the Cloudflare input (HLS for buyers), mark the room phone-sourced, mint the host's Agora token. */
export async function prepareAgoraHostSession(roomId: string): Promise<AgoraHostSession> {
  await provisionCloudflareRoomStream(roomId);
  await prisma.liveRoom.update({ where: { id: roomId }, data: { phoneRelay: true } });
  logIvsOpsServer("agora_host_session_prepared", { roomId });
  return createAgoraHostSession(roomId);
}

export function refreshAgoraHostSession(roomId: string): AgoraHostSession {
  return createAgoraHostSession(roomId);
}

export type EnsureRelayResult = { converterId: string; state: string; started: boolean };

/**
 * Make sure Agora is pushing the host's stream to the room's Cloudflare input. Idempotent: a
 * converter that is still connecting/running is left alone; a failed or vanished one is replaced.
 * Call after the host has joined the Agora channel (and again after a reconnect).
 */
export async function ensureAgoraRelay(roomId: string): Promise<EnsureRelayResult> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, externalStreamId: true, externalRelayId: true },
  });
  if (!room || room.streamProvider !== "cloudflare_stream" || !room.externalStreamId) {
    throw new Error("Live video is not set up for this room yet.");
  }

  if (room.externalRelayId) {
    const existing = await getAgoraRelay(room.externalRelayId).catch(() => null);
    if (existing && (existing.state === "running" || existing.state === "connecting")) {
      return { converterId: existing.converterId, state: existing.state, started: false };
    }
    await stopAgoraRelay(room.externalRelayId);
  }

  const input = await getCloudflareLiveInput(room.externalStreamId);
  const relay = await startAgoraRelay({ roomId, rtmpUrl: joinRtmpUrl(input.rtmpsUrl, input.streamKey) });
  await prisma.liveRoom.update({ where: { id: roomId }, data: { externalRelayId: relay.converterId } });
  return { converterId: relay.converterId, state: relay.state, started: true };
}

/** Host stopped / left: stop the relay. The Cloudflare input is torn down by the normal end-of-show path. */
export async function stopAgoraRelayForRoom(roomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { externalRelayId: true } });
  if (!room?.externalRelayId) return;
  await stopAgoraRelay(room.externalRelayId);
  await prisma.liveRoom.update({ where: { id: roomId }, data: { externalRelayId: null } });
}
