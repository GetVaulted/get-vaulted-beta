import type { LiveRoomModerationActionType, LiveRoomModeratorLevel } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canModeratorPerformAction,
  isModeratorActionBlockedOnHost,
  resolveViewerRole,
  type LiveViewerRole,
} from "@/lib/trust/live-room-moderator-permissions";
import { logTrustModerationAction } from "@/lib/trust/moderation-audit-log";
import { emitLiveRoomMessageById, emitLiveRoomModerationChanged } from "@/lib/realtime-emit-server";

export type { LiveViewerRole };
export type LiveRoomModeratorLevelType = LiveRoomModeratorLevel;

export type LiveRoomUserRestrictions = {
  muted: boolean;
  roomBanned: boolean;
  bidBlocked: boolean;
  kickedUntil: string | null;
  sellerStreamBanned: boolean;
};

export type LiveRoomModeratorContext = {
  isHost: boolean;
  isModerator: boolean;
  canModerate: boolean;
  viewerRole: LiveViewerRole;
  moderatorLevel: LiveRoomModeratorLevel | null;
};

const REVERSAL: Partial<Record<LiveRoomModerationActionType, LiveRoomModerationActionType>> = {
  mute: "unmute",
  timeout: "unmute",
  kick: "unkick",
  room_ban: "unban",
  block_bidding: "unblock_bidding",
  seller_stream_ban: "seller_stream_unban",
};

function isActive(expiresAt: Date | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() > now.getTime();
}

const PIN_EXPIRES_MINUTES_ALLOWED = [15, 30, 60, 120, 240, 24 * 60] as const;
const DEFAULT_PIN_EXPIRES_MINUTES = 60;

function resolvePinExpiresMinutes(rawMinutes: unknown): number {
  const minutes = Number(rawMinutes ?? DEFAULT_PIN_EXPIRES_MINUTES);
  return PIN_EXPIRES_MINUTES_ALLOWED.includes(minutes as (typeof PIN_EXPIRES_MINUTES_ALLOWED)[number])
    ? minutes
    : DEFAULT_PIN_EXPIRES_MINUTES;
}

function resolvePinExpiryDate(pinnedAt: Date, expiresMinutes: number): Date | null {
  return expiresMinutes > 0 ? new Date(pinnedAt.getTime() + expiresMinutes * 60 * 1000) : null;
}

async function setLiveRoomPinnedMessage(args: {
  liveRoomId: string;
  moderatorUserId: string;
  body: string;
  expiresMinutes?: unknown;
}): Promise<void> {
  const body = args.body.trim().slice(0, 500);
  if (!body) {
    await prisma.liveRoom.update({
      where: { id: args.liveRoomId },
      data: {
        pinnedModeratorMessage: null,
        pinnedModeratorMessageAt: null,
        pinnedModeratorMessageExpiresAt: null,
        pinnedModeratorUserId: null,
      },
    });
    return;
  }

  const expiresMinutes = resolvePinExpiresMinutes(args.expiresMinutes);
  const pinnedAt = new Date();
  const expiresAt = resolvePinExpiryDate(pinnedAt, expiresMinutes);
  await prisma.liveRoom.update({
    where: { id: args.liveRoomId },
    data: {
      pinnedModeratorMessage: body,
      pinnedModeratorMessageAt: pinnedAt,
      pinnedModeratorMessageExpiresAt: expiresAt,
      pinnedModeratorUserId: args.moderatorUserId,
    },
  });
}

async function resolvePinnedModeratorUser(
  liveRoomId: string,
  pinnedUserId: string | null,
): Promise<{ userId: string; username: string; avatarUrl: string | null } | null> {
  if (pinnedUserId) {
    const user = await prisma.user.findUnique({
      where: { id: pinnedUserId },
      select: { id: true, username: true, image: true },
    });
    if (user) {
      return {
        userId: user.id,
        username: user.username,
        avatarUrl: user.image?.trim() || null,
      };
    }
  }

  const recentPins = await prisma.liveRoomModerationAction.findMany({
    where: {
      liveRoomId,
      actionType: { in: ["pin_message", "post_announcement"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      metadata: true,
      moderator: { select: { id: true, username: true, image: true } },
    },
  });

  for (const row of recentPins) {
    const meta = row.metadata as { body?: unknown } | null;
    const body = typeof meta?.body === "string" ? meta.body.trim() : "";
    if (!body) continue;
    return {
      userId: row.moderator.id,
      username: row.moderator.username,
      avatarUrl: row.moderator.image?.trim() || null,
    };
  }

  return null;
}

async function resolveEffectivePinExpiry(
  liveRoomId: string,
  room: {
    pinnedModeratorMessageAt: Date | null;
    pinnedModeratorMessageExpiresAt: Date | null;
  },
): Promise<Date | null> {
  if (room.pinnedModeratorMessageExpiresAt) {
    return room.pinnedModeratorMessageExpiresAt;
  }
  if (!room.pinnedModeratorMessageAt) return null;

  const lastPin = await prisma.liveRoomModerationAction.findFirst({
    where: {
      liveRoomId,
      actionType: { in: ["pin_message", "post_announcement"] },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const meta = lastPin?.metadata as { body?: unknown; expiresMinutes?: unknown } | null;
  const body = typeof meta?.body === "string" ? meta.body.trim() : "";
  if (!body) {
    return new Date(
      room.pinnedModeratorMessageAt.getTime() + DEFAULT_PIN_EXPIRES_MINUTES * 60 * 1000,
    );
  }
  if (meta?.expiresMinutes === 0) return null;

  const rawMinutes = Number(meta?.expiresMinutes ?? DEFAULT_PIN_EXPIRES_MINUTES);
  const minutes = PIN_EXPIRES_MINUTES_ALLOWED.includes(
    rawMinutes as (typeof PIN_EXPIRES_MINUTES_ALLOWED)[number],
  )
    ? rawMinutes
    : DEFAULT_PIN_EXPIRES_MINUTES;
  if (minutes <= 0) return null;

  return new Date(room.pinnedModeratorMessageAt.getTime() + minutes * 60 * 1000);
}

async function clearPinnedMessage(liveRoomId: string, emitChange: boolean): Promise<void> {
  await prisma.liveRoom.update({
    where: { id: liveRoomId },
    data: {
      pinnedModeratorMessage: null,
      pinnedModeratorMessageAt: null,
      pinnedModeratorMessageExpiresAt: null,
      pinnedModeratorUserId: null,
    },
  });
  if (emitChange) {
    emitLiveRoomModerationChanged(liveRoomId);
  }
}

/** Clears expired pins and returns the active pinned body (if any). */
export async function resolveLiveRoomPinnedMessage(liveRoomId: string): Promise<{
  body: string | null;
  pinnedAt: Date | null;
  expiresAt: Date | null;
  pinnedBy: { userId: string; username: string; avatarUrl: string | null } | null;
}> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      pinnedModeratorMessage: true,
      pinnedModeratorMessageAt: true,
      pinnedModeratorMessageExpiresAt: true,
      pinnedModeratorUserId: true,
    },
  });
  if (!room?.pinnedModeratorMessage?.trim()) {
    return { body: null, pinnedAt: null, expiresAt: null, pinnedBy: null };
  }
  const now = new Date();
  const effectiveExpiresAt = await resolveEffectivePinExpiry(liveRoomId, room);
  if (effectiveExpiresAt && effectiveExpiresAt <= now) {
    await clearPinnedMessage(liveRoomId, true);
    return { body: null, pinnedAt: null, expiresAt: null, pinnedBy: null };
  }
  if (!room.pinnedModeratorMessageExpiresAt && effectiveExpiresAt && effectiveExpiresAt > now) {
    await prisma.liveRoom
      .update({
        where: { id: liveRoomId },
        data: { pinnedModeratorMessageExpiresAt: effectiveExpiresAt },
      })
      .catch(() => undefined);
  }
  let pinnedBy = await resolvePinnedModeratorUser(liveRoomId, room.pinnedModeratorUserId);
  if (!room.pinnedModeratorUserId && pinnedBy) {
    await prisma.liveRoom
      .update({
        where: { id: liveRoomId },
        data: { pinnedModeratorUserId: pinnedBy.userId },
      })
      .catch(() => undefined);
  }
  return {
    body: room.pinnedModeratorMessage,
    pinnedAt: room.pinnedModeratorMessageAt,
    expiresAt: effectiveExpiresAt ?? room.pinnedModeratorMessageExpiresAt,
    pinnedBy,
  };
}

export async function getLiveRoomModeratorContext(args: {
  liveRoomId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<LiveRoomModeratorContext> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (!room) {
    return {
      isHost: false,
      isModerator: false,
      canModerate: false,
      viewerRole: "buyer",
      moderatorLevel: null,
    };
  }

  const isHost = room.sellerId === args.userId;
  if (args.isAdmin) {
    return {
      isHost,
      isModerator: false,
      canModerate: true,
      viewerRole: isHost ? "host" : "moderator",
      moderatorLevel: "head",
    };
  }

  const mod = await prisma.liveRoomModerator.findFirst({
    where: { liveRoomId: args.liveRoomId, userId: args.userId, revokedAt: null },
    select: { moderatorLevel: true },
  });
  const isModerator = Boolean(mod);
  const canModerate = isHost || isModerator;
  const moderatorLevel = isHost ? ("head" as const) : mod?.moderatorLevel ?? (isModerator ? ("show" as const) : null);

  return {
    isHost,
    isModerator,
    canModerate,
    viewerRole: resolveViewerRole({ isHost, isModerator }),
    moderatorLevel,
  };
}

export async function isLiveRoomHostOrModerator(args: {
  liveRoomId: string;
  userId: string;
  isAdmin?: boolean;
}): Promise<{ isHost: boolean; isModerator: boolean; canModerate: boolean }> {
  const ctx = await getLiveRoomModeratorContext(args);
  return { isHost: ctx.isHost, isModerator: ctx.isModerator, canModerate: ctx.canModerate };
}

async function isSellerStreamBanned(args: {
  sellerId: string;
  userId: string;
  now?: Date;
}): Promise<boolean> {
  const now = args.now ?? new Date();
  const row = await prisma.sellerStreamBan.findFirst({
    where: {
      sellerId: args.sellerId,
      targetUserId: args.userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getLiveRoomUserRestrictions(args: {
  liveRoomId: string;
  userId: string;
}): Promise<LiveRoomUserRestrictions> {
  const now = new Date();
  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { sellerId: true },
  });
  if (!room) {
    return { muted: false, roomBanned: false, bidBlocked: false, kickedUntil: null, sellerStreamBanned: false };
  }

  const actions = await prisma.liveRoomModerationAction.findMany({
    where: {
      liveRoomId: args.liveRoomId,
      targetUserId: args.userId,
      actionType: {
        in: [
          "mute",
          "unmute",
          "timeout",
          "kick",
          "room_ban",
          "unban",
          "block_bidding",
          "unblock_bidding",
        ],
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
    if (seen.has(a.actionType)) continue;

    const reversal = REVERSAL[a.actionType as keyof typeof REVERSAL];
    if (reversal && seen.has(reversal)) continue;

    if (
      a.actionType === "unmute" ||
      a.actionType === "unban" ||
      a.actionType === "unkick" ||
      a.actionType === "unblock_bidding" ||
      a.actionType === "seller_stream_unban"
    ) {
      seen.add(a.actionType);
      continue;
    }
    if (!isActive(a.expiresAt, now)) continue;

    if (a.actionType === "mute" || a.actionType === "timeout") muted = true;
    if (a.actionType === "room_ban") roomBanned = true;
    if (a.actionType === "block_bidding") bidBlocked = true;
    if (a.actionType === "kick") {
      if (!a.expiresAt) roomBanned = true;
      else kickedUntil = a.expiresAt.toISOString();
    }
    seen.add(a.actionType);
  }

  const sellerStreamBanned = await isSellerStreamBanned({
    sellerId: room.sellerId,
    userId: args.userId,
    now,
  });

  if (roomBanned || sellerStreamBanned) {
    muted = true;
    bidBlocked = true;
  }

  return { muted, roomBanned, bidBlocked, kickedUntil, sellerStreamBanned };
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
  const ctx = await getLiveRoomModeratorContext({
    liveRoomId: args.liveRoomId,
    userId: args.moderatorUserId,
    isAdmin: args.isAdmin,
  });
  if (!ctx.canModerate) return { ok: false, error: "Not authorized to moderate this room." };

  const room = await prisma.liveRoom.findUnique({
    where: { id: args.liveRoomId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!room) return { ok: false, error: "Room not found." };

  const reason = (args.reason ?? "").trim().slice(0, 500);
  let actionType = args.actionType;

  if (
    !canModeratorPerformAction({
      actionType,
      isHost: ctx.isHost,
      moderatorLevel: ctx.moderatorLevel,
      isModerator: ctx.isModerator,
      isAdmin: args.isAdmin,
    })
  ) {
    return { ok: false, error: "Your moderator level cannot perform this action." };
  }

  let resolvedTargetUserId = args.targetUserId ?? null;
  if (actionType === "delete_message") {
    if (!args.targetMessageId) return { ok: false, error: "Message id required." };
    const msg = await prisma.liveRoomMessage.findFirst({
      where: { id: args.targetMessageId, liveRoomId: args.liveRoomId },
      select: { id: true, deletedAt: true, senderId: true },
    });
    if (!msg) return { ok: false, error: "Message not found." };
    resolvedTargetUserId = resolvedTargetUserId ?? msg.senderId;
    if (
      isModeratorActionBlockedOnHost({
        actionType,
        targetUserId: resolvedTargetUserId,
        hostUserId: room.sellerId,
        isAdmin: args.isAdmin,
      })
    ) {
      return { ok: false, error: "Cannot moderate the host." };
    }
    if (!msg.deletedAt) {
      await prisma.liveRoomMessage.update({
        where: { id: msg.id },
        data: { deletedAt: new Date(), deletedByUserId: args.moderatorUserId },
      });
    }
  }

  if (
    resolvedTargetUserId &&
    isModeratorActionBlockedOnHost({
      actionType,
      targetUserId: resolvedTargetUserId,
      hostUserId: room.sellerId,
      isAdmin: args.isAdmin,
    })
  ) {
    return { ok: false, error: "Cannot moderate the host." };
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
    await setLiveRoomPinnedMessage({
      liveRoomId: args.liveRoomId,
      moderatorUserId: args.moderatorUserId,
      body,
      expiresMinutes: args.metadata?.expiresMinutes,
    });
    if (body) {
      if (!args.metadata) args.metadata = {};
      args.metadata = {
        ...args.metadata,
        body,
        expiresMinutes: resolvePinExpiresMinutes(args.metadata?.expiresMinutes),
      };
    }
  }

  if (actionType === "post_announcement") {
    const body = typeof args.metadata?.body === "string" ? args.metadata.body.trim().slice(0, 500) : "";
    if (!body) return { ok: false, error: "post_announcement requires body." };
    const expiresMinutes = resolvePinExpiresMinutes(args.metadata?.expiresMinutes);
    const announcementBody = `📢 ${body}`;
    const msg = await prisma.liveRoomMessage.create({
      data: {
        liveRoomId: args.liveRoomId,
        senderId: args.moderatorUserId,
        body: announcementBody,
        messageType: "chat",
      },
      select: { id: true },
    });
    void emitLiveRoomMessageById(msg.id);
    await setLiveRoomPinnedMessage({
      liveRoomId: args.liveRoomId,
      moderatorUserId: args.moderatorUserId,
      body,
      expiresMinutes,
    });
    if (!args.metadata) args.metadata = {};
    args.metadata = { ...args.metadata, body, expiresMinutes };
  }

  if (actionType === "run_giveaway") {
    const title = typeof args.metadata?.title === "string" ? args.metadata.title.trim().slice(0, 200) : "";
    if (!title) return { ok: false, error: "run_giveaway requires title." };
  }

  if (actionType === "seller_stream_ban") {
    if (!args.targetUserId) return { ok: false, error: "Target user required." };
    await prisma.sellerStreamBan.create({
      data: {
        sellerId: room.sellerId,
        targetUserId: args.targetUserId,
        bannedByUserId: args.moderatorUserId,
        liveRoomId: args.liveRoomId,
        reason,
        expiresAt: args.expiresAt ?? null,
      },
    });
  }

  if (actionType === "seller_stream_unban") {
    if (!args.targetUserId) return { ok: false, error: "Target user required." };
    await prisma.sellerStreamBan.updateMany({
      where: {
        sellerId: room.sellerId,
        targetUserId: args.targetUserId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  const userActions: LiveRoomModerationActionType[] = [
    "mute",
    "unmute",
    "timeout",
    "kick",
    "unkick",
    "room_ban",
    "unban",
    "block_bidding",
    "unblock_bidding",
    "seller_stream_ban",
    "seller_stream_unban",
  ];
  if (userActions.includes(actionType) && !args.targetUserId) {
    return { ok: false, error: "Target user required." };
  }

  let expiresAt = args.expiresAt ?? null;
  if (actionType === "timeout") {
    const minutes = Number(args.metadata?.durationMinutes ?? 5);
    const allowed = [5, 30, 60, 24 * 60];
    const picked = allowed.includes(minutes) ? minutes : 5;
    expiresAt = new Date(Date.now() + picked * 60 * 1000);
    actionType = "timeout";
  }
  if (actionType === "mute" && !expiresAt) {
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  if (actionType === "kick" && !expiresAt) {
    expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
  }

  await prisma.liveRoomModerationAction.create({
    data: {
      liveRoomId: args.liveRoomId,
      sellerId: room.sellerId,
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

  emitLiveRoomModerationChanged(args.liveRoomId, {
    userId: args.targetUserId ?? undefined,
  });

  return { ok: true };
}

export async function assignLiveRoomModerator(args: {
  liveRoomId: string;
  userId: string;
  assignedByUserId: string;
  isAdmin?: boolean;
  moderatorLevel?: LiveRoomModeratorLevel;
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

  const level = args.moderatorLevel ?? "show";

  await prisma.liveRoomModerator.upsert({
    where: { liveRoomId_userId: { liveRoomId: args.liveRoomId, userId: args.userId } },
    create: {
      liveRoomId: args.liveRoomId,
      userId: args.userId,
      assignedByUserId: args.assignedByUserId,
      moderatorLevel: level,
      revokedAt: null,
    },
    update: { revokedAt: null, assignedByUserId: args.assignedByUserId, moderatorLevel: level },
  });

  await logTrustModerationAction({
    actorUserId: args.assignedByUserId,
    action: "live_room_moderator_assigned",
    targetType: "user",
    targetId: args.userId,
    liveRoomId: args.liveRoomId,
  });

  emitLiveRoomModerationChanged(args.liveRoomId, { userId: args.userId });

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

  emitLiveRoomModerationChanged(args.liveRoomId, { userId: args.userId });

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
    moderatorLevel: r.moderatorLevel,
    assignedByUserId: r.assignedByUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type LiveRoomModHistoryRow = {
  id: string;
  actionType: LiveRoomModerationActionType;
  moderatorUserId: string;
  moderatorUsername: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  targetMessageId: string | null;
  reason: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function listLiveRoomModHistory(liveRoomId: string, take = 50): Promise<LiveRoomModHistoryRow[]> {
  const rows = await prisma.liveRoomModerationAction.findMany({
    where: { liveRoomId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      moderator: { select: { username: true } },
      targetUser: { select: { username: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    actionType: r.actionType,
    moderatorUserId: r.moderatorUserId,
    moderatorUsername: r.moderator?.username ?? null,
    targetUserId: r.targetUserId,
    targetUsername: r.targetUser?.username ?? null,
    targetMessageId: r.targetMessageId,
    reason: r.reason,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type LiveRoomModQueueRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  reporterUsername: string | null;
  createdAt: string;
};

export async function listLiveRoomModQueue(liveRoomId: string, take = 30): Promise<LiveRoomModQueueRow[]> {
  const rows = await prisma.report.findMany({
    where: { liveRoomId, status: { in: ["open", "reviewing"] } },
    orderBy: { createdAt: "desc" },
    take,
    include: { reporter: { select: { username: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    description: r.description,
    reporterUsername: r.reporter.username,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type LiveRoomViewerRow = {
  userId: string;
  username: string;
  lastSeenAt: string;
  messageCount: number;
};

export async function listLiveRoomRecentViewers(liveRoomId: string, take = 100): Promise<LiveRoomViewerRow[]> {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await prisma.liveRoomMessage.findMany({
    where: {
      liveRoomId,
      deletedAt: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      senderId: true,
      createdAt: true,
      sender: { select: { username: true } },
    },
  });

  const map = new Map<string, LiveRoomViewerRow>();
  for (const row of rows) {
    if (!row.senderId) continue;
    const existing = map.get(row.senderId);
    if (existing) {
      existing.messageCount += 1;
      if (row.createdAt.toISOString() > existing.lastSeenAt) {
        existing.lastSeenAt = row.createdAt.toISOString();
      }
      continue;
    }
    map.set(row.senderId, {
      userId: row.senderId,
      username: row.sender.username?.trim() || "Member",
      lastSeenAt: row.createdAt.toISOString(),
      messageCount: 1,
    });
    if (map.size >= take) break;
  }

  return [...map.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
