import type { LiveStreamArchiveStatus, LiveStreamRecordingStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

/** Default replay retention when env unset (days). */
export function replayRetentionDays(): number {
  const raw = process.env.REPLAY_RETENTION_DAYS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function replayRetentionCutoff(): Date {
  return new Date(Date.now() - replayRetentionDays() * 24 * 60 * 60 * 1000);
}

function pendingReplayUrl(liveRoomId: string, endedAt: Date): string {
  return `pending://replay/${encodeURIComponent(liveRoomId)}/${endedAt.getTime()}`;
}

function durableReplayUrl(liveRoomId: string, replayId: string): string {
  return `s3://replay/${encodeURIComponent(liveRoomId)}/${encodeURIComponent(replayId)}`;
}

/** Record replay metadata when a live show ends — waits for IVS recording webhook for VOD. */
export async function finalizeLiveStreamReplay(liveRoomId: string): Promise<void> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      ivsChannelArn: true,
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
  const replayUrl = pendingReplayUrl(room.id, endedAt);

  const existing = await prisma.liveStreamReplay.findFirst({
    where: { liveRoomId, endedAt: { gte: new Date(endedAt.getTime() - 60_000) } },
    select: { id: true, recordingStatus: true },
  });
  if (existing) {
    if (existing.recordingStatus === "pending") {
      await prisma.liveStreamReplay.update({
        where: { id: existing.id },
        data: { recordingStatus: "recording", recordingError: null },
      });
    }
    return;
  }

  await prisma.liveStreamReplay.create({
    data: {
      liveRoomId: room.id,
      sellerId: room.sellerId,
      streamSessionId,
      replayUrl,
      durationSeconds: durationSeconds > 0 ? durationSeconds : null,
      startedAt,
      endedAt,
      recordingStatus: room.ivsChannelArn ? "recording" : "pending",
    },
  });
}

export async function markReplayRecordingReady(args: {
  channelArn: string;
  s3Bucket: string;
  s3KeyPrefix: string;
  hlsMasterKey?: string | null;
}): Promise<{ replayId: string; liveRoomId: string } | null> {
  const roomId = await prisma.liveRoom.findFirst({
    where: { ivsChannelArn: args.channelArn },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!roomId) return null;

  const prefix = args.s3KeyPrefix.replace(/^\/+|\/+$/g, "");
  const masterKey =
    args.hlsMasterKey?.trim() ||
    `${prefix}/media/hls/master.m3u8`.replace(/\/+/g, "/");

  const replay = await prisma.liveStreamReplay.findFirst({
    where: {
      liveRoomId: roomId.id,
      deletedAt: null,
      recordingStatus: { in: ["pending", "recording", "failed"] },
    },
    orderBy: { endedAt: "desc" },
    select: { id: true },
  });
  if (!replay) return null;

  await prisma.liveStreamReplay.update({
    where: { id: replay.id },
    data: {
      recordingStatus: "ready",
      s3Bucket: args.s3Bucket,
      s3KeyPrefix: prefix,
      hlsMasterKey: masterKey,
      recordingError: null,
      replayUrl: durableReplayUrl(roomId.id, replay.id),
    },
  });

  return { replayId: replay.id, liveRoomId: roomId.id };
}

export async function markReplayRecordingFailed(args: {
  channelArn: string;
  errorMessage: string;
}): Promise<{ replayId: string; liveRoomId: string } | null> {
  const roomId = await prisma.liveRoom.findFirst({
    where: { ivsChannelArn: args.channelArn },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!roomId) return null;

  const replay = await prisma.liveStreamReplay.findFirst({
    where: {
      liveRoomId: roomId.id,
      deletedAt: null,
      recordingStatus: { in: ["pending", "recording"] },
    },
    orderBy: { endedAt: "desc" },
    select: { id: true },
  });
  if (!replay) return null;

  const message = args.errorMessage.trim().slice(0, 500) || "IVS recording failed";
  await prisma.liveStreamReplay.update({
    where: { id: replay.id },
    data: {
      recordingStatus: "failed",
      recordingError: message,
    },
  });

  return { replayId: replay.id, liveRoomId: roomId.id };
}

export async function listActiveReplaysForRoom(liveRoomId: string) {
  const retentionCutoff = replayRetentionCutoff();
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

export type AdminReplayListRow = {
  id: string;
  liveRoomId: string;
  sellerId: string;
  streamSessionId: string | null;
  replayUrl: string | null;
  replayPending: boolean;
  recordingStatus: LiveStreamRecordingStatus;
  archiveStatus: LiveStreamArchiveStatus;
  s3Bucket: string | null;
  s3KeyPrefix: string | null;
  hlsMasterKey: string | null;
  archiveS3Key: string | null;
  recordingError: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  daysRemaining: number;
  showTitle: string | null;
  sellerUsername: string | null;
  sellerEmail: string | null;
};

export async function listAdminReplays(args?: { liveRoomId?: string; take?: number }): Promise<AdminReplayListRow[]> {
  const retentionCutoff = replayRetentionCutoff();
  const take = Math.min(Math.max(args?.take ?? 100, 1), 200);
  const rows = await prisma.liveStreamReplay.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: retentionCutoff },
      ...(args?.liveRoomId ? { liveRoomId: args.liveRoomId } : {}),
    },
    include: {
      liveRoom: { select: { title: true } },
      seller: { select: { username: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const retentionMs = replayRetentionDays() * 24 * 60 * 60 * 1000;
  return rows.map((row) => {
    const base = serializeReplay(row);
    const ageMs = Date.now() - row.createdAt.getTime();
    const daysRemaining = Math.max(0, Math.ceil((retentionMs - ageMs) / (24 * 60 * 60 * 1000)));
    return {
      ...base,
      recordingStatus: row.recordingStatus,
      archiveStatus: row.archiveStatus,
      s3Bucket: row.s3Bucket,
      s3KeyPrefix: row.s3KeyPrefix,
      hlsMasterKey: row.hlsMasterKey,
      archiveS3Key: row.archiveS3Key,
      recordingError: row.recordingError,
      daysRemaining,
      showTitle: row.liveRoom.title,
      sellerUsername: row.seller.username,
      sellerEmail: row.seller.email,
    };
  });
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
  recordingStatus?: LiveStreamRecordingStatus;
  archiveStatus?: LiveStreamArchiveStatus;
  s3Bucket?: string | null;
  s3KeyPrefix?: string | null;
  hlsMasterKey?: string | null;
  archiveS3Key?: string | null;
  recordingError?: string | null;
}) {
  const pending =
    row.replayUrl.startsWith("pending://") ||
    row.recordingStatus === "pending" ||
    row.recordingStatus === "recording";
  return {
    id: row.id,
    liveRoomId: row.liveRoomId,
    sellerId: row.sellerId,
    streamSessionId: row.streamSessionId,
    replayUrl: pending || row.replayUrl.startsWith("s3://") ? null : row.replayUrl,
    replayPending: pending,
    recordingStatus: row.recordingStatus ?? ("pending" as LiveStreamRecordingStatus),
    archiveStatus: row.archiveStatus ?? ("none" as LiveStreamArchiveStatus),
    s3Bucket: row.s3Bucket ?? null,
    s3KeyPrefix: row.s3KeyPrefix ?? null,
    hlsMasterKey: row.hlsMasterKey ?? null,
    archiveS3Key: row.archiveS3Key ?? null,
    recordingError: row.recordingError ?? null,
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
