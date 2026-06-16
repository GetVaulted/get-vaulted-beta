import { NextResponse } from "next/server";
import type { LiveRoomModerationActionType } from "@/generated/prisma/enums";
import type { LiveRoomModeratorLevel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { requireAdmin } from "@/lib/require-admin";
import {
  applyLiveRoomModerationAction,
  getLiveRoomModeratorContext,
  getLiveRoomUserRestrictions,
  listLiveRoomModHistory,
  listLiveRoomModQueue,
  listLiveRoomModerators,
  listLiveRoomRecentViewers,
} from "@/lib/trust/live-room-moderation";
import { listAllowedModerationActions } from "@/lib/trust/live-room-moderator-permissions";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      slowModeSeconds: true,
      pinnedModeratorMessage: true,
      pinnedModeratorMessageAt: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await resolveLiveRoomsUserId(req);
  let modCtx: {
    canModerate: boolean;
    viewerRole: "buyer" | "host" | "moderator";
    moderatorLevel: LiveRoomModeratorLevel | null;
    isHost: boolean;
  } = {
    canModerate: false,
    viewerRole: "buyer",
    moderatorLevel: null,
    isHost: false,
  };

  if (!(auth instanceof NextResponse)) {
    const ctxRow = await getLiveRoomModeratorContext({ liveRoomId, userId: auth.userId });
    modCtx = {
      canModerate: ctxRow.canModerate,
      viewerRole: ctxRow.viewerRole,
      moderatorLevel: ctxRow.moderatorLevel,
      isHost: ctxRow.isHost,
    };
  }

  const moderators = modCtx.canModerate ? await listLiveRoomModerators(liveRoomId) : [];

  let myRestrictions = null;
  if (!(auth instanceof NextResponse)) {
    myRestrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  }

  const allowedActions = modCtx.canModerate
    ? listAllowedModerationActions({
        isHost: modCtx.isHost,
        moderatorLevel: modCtx.moderatorLevel,
      })
    : [];

  const modHistory = modCtx.canModerate ? await listLiveRoomModHistory(liveRoomId) : [];
  const modQueue = modCtx.canModerate ? await listLiveRoomModQueue(liveRoomId) : [];
  const viewers = modCtx.canModerate ? await listLiveRoomRecentViewers(liveRoomId) : [];

  return NextResponse.json({
    slowModeSeconds: room.slowModeSeconds,
    pinnedModeratorMessage: room.pinnedModeratorMessage,
    pinnedModeratorMessageAt: room.pinnedModeratorMessageAt?.toISOString() ?? null,
    canModerate: modCtx.canModerate,
    viewerRole: modCtx.viewerRole,
    moderatorLevel: modCtx.moderatorLevel,
    allowedActions,
    sellerId: modCtx.canModerate ? room.sellerId : undefined,
    moderators,
    myRestrictions,
    modHistory,
    modQueue,
    viewers,
  });
}

type PostBody = {
  actionType?: string;
  targetUserId?: string;
  targetMessageId?: string;
  reason?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const adminGate = await requireAdmin();
  const isAdmin = adminGate.ok;

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionType = body.actionType?.trim() as LiveRoomModerationActionType | undefined;
  if (!actionType) {
    return NextResponse.json({ error: "actionType required." }, { status: 400 });
  }

  const expiresAt =
    typeof body.expiresAt === "string" && body.expiresAt.trim()
      ? new Date(body.expiresAt)
      : null;

  const result = await applyLiveRoomModerationAction({
    liveRoomId,
    moderatorUserId: auth.userId,
    actionType,
    targetUserId: body.targetUserId?.trim() || null,
    targetMessageId: body.targetMessageId?.trim() || null,
    reason: body.reason,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    metadata: body.metadata ?? null,
    isAdmin,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
