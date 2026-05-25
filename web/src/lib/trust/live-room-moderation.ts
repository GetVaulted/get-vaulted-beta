import type { LiveRoomModerationActionType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";

export type LiveRoomUserRestrictions = {
  muted: boolean;
  roomBanned: boolean;
  bidBlocked: boolean;
  kickedUntil: string | null;
};

const REVERSAL: Partial<Record<LiveRoomModerationActionType, LiveRoomModerationActionType>> = {
  mute: "unmute",
  room_ban: "unban",
  block_bidding: "unblock_bidding",
};

function isActive(expiresAt: Date | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() > now.getTime();
}

export async function isLiveRoomHostOrModerator(args: {
  liveRoomId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<{ isHost: boolean; isModerator: boolean; canModerate: boolean }> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (!room) return { isHost: false, isModerator: false, canModerate: false };
  const isHost = room.sellerId === args.userId;
  if (args.isAdmin) return { isHost, isModerator: false, canModerate: true };

  const mod = await prisma.liveRoomModerator.findFirst({
    where: { liveRoomId: args.liveRoomId, userId: args.userId, revokedAt: null },
    select: { id: true },
  });
  const isModerator = Boolean(mod);
  return { isHost, isModerator, canModerate: isHost || isModerator };
}

export async function getLiveRoomUserRestrictions(args: {
  liveRoomId: string;
  userId: string;
}): Promise<LiveRoomUserRestrictions> {
  const now = new Date();
  const actions = await prisma.liveRoomModerationAction.findMany({
    where: {
      liveRoomId: args.liveRoomId,
      targetUserId: args.userId,
      actionType: {
        in: ["mute", "unmute", "kick", "room_ban", "unban", "block_bidding", "unblock_bidding"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { actionType: true, expiresAt: true, createdAt: true },
  });

  let muted = false;
  let roomBanned = false;
  let bidBlocked = false;
  let kickedUntil: string | null = null;

  const seen = new Set<string>();
  for (const a of actions) {
    const key = a.actionType;
    if (seen.has(key) || (REVERSAL[a.actionType as keyof typeof REVERSAL] && seen.has(a.actionType))) continue;
    if (a.actionType === "unmute" || a.actionType === "unban" || a.actionType === "unblock_bidding") {
      seen.add(a.actionType);
      continue;
    }
    if (!isActive(a.expiresAt, now)) continue;

    if (a.actionType === "mute") muted = true;
    if (a.actionType === "room_ban") roomBanned = true;
    if (a.actionType === "block_bidding") bidBlocked = true;
    if (a.actionType === "kick") kickedUntil = a.expiresAt?.toISOString() ?? null;
    seen.add(a.actionType);
  }

  if (roomBanned) {
    muted = true;
    bidBlocked = true;
  }

  return { muted, roomBanned, bidBlocked, kickedUntil };
}

export async function getLiveRoomSlowModeSeconds(liveRoomId: string): Promise<number> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { slowModeSeconds: true },
  });
  return Math.max(0, room?.slowModeSeconds ?? 0);
}

export async function getLastChatAt(liveRoomId: string, userId: string): Promise<Date | null> {
  const row = await prisma.liveRoomMessage.findFirst({
    where: { liveRoomId, senderId: userId, messageType: "chat", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export async function applyLiveRoomModerationAction(args: {
  liveRoomId: string;
  moderatorUserId: string;
  actionType: LiveRoomModerationActionType;
  targetUserId?: string | null;
  targetMessageId?: string | null;
  reason?: string;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  isAdmin?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const perm = await isLiveRoomHostOrModerator({
    liveRoomId: args.liveRoomId,
    userId: args.moderatorUserId,
    isAdmin: args.isAdmin,
  });
  if (!perm.canModerate) return { ok: false, error: "Not authorized to moderate this room." };

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!room) return { ok: false, error: "Room not found." };

  const reason = (args.reason ?? "").trim().slice(0, 500);
  const actionType = args.actionType;

  if (actionType === "delete_message") {
    if (!args.targetMessageId) return { ok: false, error: "Message id required." };
    const msg = await prisma.liveRoomMessage.findFirst({
      where: { id: args.targetMessageId, liveRoomId: args.liveRoomId },
      select: { id: true, deletedAt: true },
    });
    if (!msg) return { ok: false, error: "Message not found." };
    if (!msg.deletedAt) {
      await prisma.liveRoomMessage.update({
        where: { id: msg.id },
        data: { deletedAt: new Date(), deletedByUserId: args.moderatorUserId },
      });
    }
  }

  if (actionType === "slow_mode") {
    const seconds = Number(args.metadata?.seconds ?? 0);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) {
      return { ok: false, error: "slow_mode requires seconds 0–300." };
    }
    await prisma.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { slowModeSeconds: Math.round(seconds) },
    });
  }

  if (actionType === "pin_message") {
    const body = typeof args.metadata?.body === "string" ? args.metadata.body.trim().slice(0, 500) : "";
    if (!body) return { ok: false, error: "pin_message requires body." };
    await prisma.liveRoom.update({
      where: { id: args.liveRoomId },
      data: { pinnedModeratorMessage: body, pinnedModeratorMessageAt: new Date() },
    });
  }

  const userActions: LiveRoomModerationActionType[] = [
    "mute",
    "unmute",
    "kick",
    "room_ban",
    "unban",
    "block_bidding",
    "unblock_bidding",
  ];
  if (userActions.includes(actionType) && !args.targetUserId) {
    return { ok: false, error: "Target user required." };
  }

  if (
    args.targetUserId &&
    args.targetUserId === room.sellerId &&
    !args.isAdmin &&
    actionType !== "unmute" &&
    actionType !== "unban" &&
    actionType !== "unblock_bidding"
  ) {
    return { ok: false, error: "Cannot moderate the host." };
  }

  let expiresAt = args.expiresAt ?? null;
  if (actionType === "mute" && !expiresAt) {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  if (actionType === "kick" && !expiresAt) {
    expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
  }

  await prisma.liveRoomModerationAction.create({
    data: {
      liveRoomId: args.liveRoomId,
      moderatorUserId: args.moderatorUserId,
      targetUserId: args.targetUserId ?? null,
      actionType,
      reason,
      targetMessageId: args.targetMessageId ?? null,
      metadata: args.metadata ? (args.metadata as Prisma.InputJsonValue) : undefined,
      expiresAt,
    },
  });

  await logTrustModerationAction({
    actorUserId: args.moderatorUserId,
    action: `live_room_${actionType}`,
    targetType: args.targetUserId ? "user" : "live_room",
    targetId: args.targetUserId ?? args.liveRoomId,
    liveRoomId: args.liveRoomId,
    detail: {
      reason,
      targetMessageId: args.targetMessageId ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      metadata: args.metadata ?? null,
    },
  });

  return { ok: true };
}

export async function assignLiveRoomModerator(args: {
  liveRoomId: string;
  userId: string;
  assignedByUserId: string;
  isAdmin?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const perm = await isLiveRoomHostOrModerator({
    liveRoomId: args.liveRoomId,
    userId: args.assignedByUserId,
    isAdmin: args.isAdmin,
  });
  if (!perm.isHost && !args.isAdmin) {
    return { ok: false, error: "Only the host can assign moderators." };
  }

  const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true } });
  if (!user) return { ok: false, error: "User not found." };

  await prisma.liveRoomModerator.upsert({
    where: { liveRoomId_userId: { liveRoomId: args.liveRoomId, userId: args.userId } },
    create: {
      liveRoomId: args.liveRoomId,
      userId: args.userId,
      assignedByUserId: args.assignedByUserId,
      revokedAt: null,
    },
    update: { revokedAt: null, assignedByUserId: args.assignedByUserId },
  });

  await logTrustModerationAction({
    actorUserId: args.assignedByUserId,
    action: "live_room_moderator_assigned",
    targetType: "user",
    targetId: args.userId,
    liveRoomId: args.liveRoomId,
  });

  return { ok: true };
}

export async function revokeLiveRoomModerator(args: {
  liveRoomId: string;
  userId: string;
  revokedByUserId: string;
  isAdmin?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const perm = await isLiveRoomHostOrModerator({
    liveRoomId: args.liveRoomId,
    userId: args.revokedByUserId,
    isAdmin: args.isAdmin,
  });
  if (!perm.isHost && !args.isAdmin) {
    return { ok: false, error: "Only the host or admin can remove moderators." };
  }

  await prisma.liveRoomModerator.updateMany({
    where: { liveRoomId: args.liveRoomId, userId: args.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logTrustModerationAction({
    actorUserId: args.revokedByUserId,
    action: "live_room_moderator_revoked",
    targetType: "user",
    targetId: args.userId,
    liveRoomId: args.liveRoomId,
  });

  return { ok: true };
}

export async function listLiveRoomModerators(liveRoomId: string) {
  const rows = await prisma.liveRoomModerator.findMany({
    where: { liveRoomId, revokedAt: null },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    username: r.user.username,
    assignedByUserId: r.assignedByUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}
