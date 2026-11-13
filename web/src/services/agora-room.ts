import { prisma } from "@/lib/prisma";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { createAgoraHostSession, isAgoraConfigured, type AgoraHostSession } from "@/services/agora-rtc";
import { isBackupLiveVideoActive } from "@/services/cloudflare-stream";

export type HostPublisherKind = "aws_ivs" | "agora";

/** Host app pings every ~25 s while publishing; a room silent this long is no longer live. */
export const AGORA_HOST_STALE_MS = 90_000;

function isRunning(health: string | null | undefined): boolean {
  return health === "live" || health === "connecting";
}

/**
 * Which sender the seller's phone should use for this room.
 * - A show already running on AWS never moves mid-stream.
 * - A show already running on Agora stays on Agora, even if the admin switch flips.
 * - Otherwise the admin switch decides, and only when Agora is configured.
 */
export async function resolveHostPublisher(roomId: string): Promise<HostPublisherKind> {
  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, streamHealth: true },
  });
  if (row?.streamProvider === "aws_ivs" && isRunning(row.streamHealth)) return "aws_ivs";
  if (row?.streamProvider === "agora_rtc" && isRunning(row.streamHealth)) return "agora";
  if (!(await isBackupLiveVideoActive())) return "aws_ivs";
  if (!isAgoraConfigured()) return "aws_ivs";
  return "agora";
}

/**
 * Mark the room as an Agora phone broadcast (connecting) and mint the host's publish token. The room
 * only turns `live` once the app confirms it joined the channel (`confirmAgoraHostLive`).
 */
export async function prepareAgoraHostSession(roomId: string): Promise<AgoraHostSession> {
  const session = createAgoraHostSession(roomId);
  const now = new Date();
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: {
      streamProvider: "agora_rtc",
      streamMode: "stage_webrtc",
      streamHealth: "connecting",
      streamPaused: false,
      streamStartedAt: now,
      streamEndedAt: null,
      lastIvsStatusSyncAt: now,
      lastIvsError: null,
      hostAbsentSince: null,
      phoneRelay: true,
    },
  });
  logIvsOpsServer("agora_host_session_prepared", { roomId });
  return session;
}

export function refreshAgoraHostSession(roomId: string): AgoraHostSession {
  return createAgoraHostSession(roomId);
}

/**
 * The host app joined the Agora channel and is publishing (or is still publishing: this doubles as the
 * ~25 s heartbeat). Returns true when the health actually changed, so the caller can notify viewers.
 */
export async function confirmAgoraHostLive(roomId: string): Promise<boolean> {
  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, streamHealth: true, status: true },
  });
  if (!row || row.streamProvider !== "agora_rtc" || row.status === "ended") return false;
  const changed = row.streamHealth !== "live";
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { streamHealth: "live", streamEndedAt: null, lastIvsStatusSyncAt: new Date(), hostAbsentSince: null },
  });
  if (changed) logIvsOpsServer("agora_host_live", { roomId });
  return changed;
}

/**
 * The host stopped. A show that is still live keeps its room (the seller can Go Live again, health
 * drops to connecting, like the AWS soft disconnect); a finished show is marked ended.
 */
export async function endAgoraHostSession(roomId: string): Promise<void> {
  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, status: true },
  });
  if (!row || row.streamProvider !== "agora_rtc") return;
  const now = new Date();
  if (row.status === "live") {
    await prisma.liveRoom.update({
      where: { id: roomId },
      data: { streamHealth: "connecting", lastIvsStatusSyncAt: now },
    });
    logIvsOpsServer("agora_host_soft_disconnect", { roomId });
    return;
  }
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { streamHealth: "ended", streamEndedAt: now, streamPaused: false, lastIvsStatusSyncAt: now },
  });
  logIvsOpsServer("agora_host_stopped", { roomId });
}

/**
 * Safety net for a host whose app died without saying goodbye: when no heartbeat has arrived for
 * `AGORA_HOST_STALE_MS`, drop the room from live to connecting. Returns true if it changed.
 */
export async function demoteStaleAgoraHealth(roomId: string, now: Date = new Date()): Promise<boolean> {
  const row = await prisma.liveRoom.findUnique({
    where: { id: roomId },
    select: { streamProvider: true, streamHealth: true, lastIvsStatusSyncAt: true, streamPaused: true },
  });
  if (!row || row.streamProvider !== "agora_rtc" || row.streamHealth !== "live" || row.streamPaused) return false;
  const last = row.lastIvsStatusSyncAt?.getTime() ?? 0;
  if (now.getTime() - last < AGORA_HOST_STALE_MS) return false;
  await prisma.liveRoom.update({ where: { id: roomId }, data: { streamHealth: "connecting" } });
  logIvsOpsServer("agora_host_stale", { roomId });
  return true;
}
