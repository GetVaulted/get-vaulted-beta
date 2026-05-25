import { prisma } from "@/lib/prisma";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

/** Default replay retention when env unset (days). */
export function replayRetentionDays(): number {
  const raw = process.env.REPLAY_RETENTION_DAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Record replay metadata when a live show ends (IVS URL or placeholder until VOD wired). */
export async function finalizeLiveStreamReplay(liveRoomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      ivsChannelArn: true,
      ivsPlaybackUrl: true,
      streamStartedAt: true,
      streamEndedAt: true,
      startedAt: true,
      endedAt: true,
    },
  });
  if (!room) return;

  const startedAt = room.streamStartedAt ?? room.startedAt;
  const endedAt = room.streamEndedAt ?? room.endedAt ?? new Date();
  if (!startedAt) return;

  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const streamSessionId = room.ivsChannelArn ?? room.id;
  const replayUrl =
    room.ivsPlaybackUrl?.trim() ||
    `pending://replay/${encodeURIComponent(room.id)}/${endedAt.getTime()}`;

  const existing = await prisma.liveStreamReplay.findFirst({
    where: { liveRoomId, endedAt: { gte: new Date(endedAt.getTime() - 60_000) } },
    select: { id: true },
  });
  if (existing) return;

  await prisma.liveStreamReplay.create({
    data: {
      liveRoomId: room.id,
      sellerId: room.sellerId,
      streamSessionId,
      replayUrl,
      durationSeconds: durationSeconds > 0 ? durationSeconds : null,
      startedAt,
      endedAt,
    },
  });
}

export async function listActiveReplaysForRoom(liveRoomId: string) {
  const retentionCutoff = new Date(Date.now() - replayRetentionDays() * 24 * 60 * 60 * 1000);
  const rows = await prisma.liveStreamReplay.findMany({
    where: {
      liveRoomId,
      deletedAt: null,
      createdAt: { gte: retentionCutoff },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeReplay);
}

export function serializeReplay(row: {
  id: string;
  liveRoomId: string;
  sellerId: string;
  streamSessionId: string | null;
  replayUrl: string;
  durationSeconds: number | null;
  startedAt: Date;
  endedAt: Date;
  createdAt: Date;
}) {
  const pending = row.replayUrl.startsWith("pending://");
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    sellerId: row.sellerId,
    streamSessionId: row.streamSessionId,
    replayUrl: pending ? null : row.replayUrl,
    replayPending: pending,
    durationSeconds: row.durationSeconds,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function adminDeleteReplay(args: {
  replayId: string;
  adminUserId: string;
}): Promise<void> {
  await prisma.liveStreamReplay.update({
    where: { id: args.replayId },
    data: { deletedAt: new Date(), deletedByAdminId: args.adminUserId },
  });
  await logTrustModerationAction({
    actorUserId: args.adminUserId,
    action: "replay_deleted",
    targetType: "replay",
    targetId: args.replayId,
  });
}
