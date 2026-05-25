import { NextResponse } from "next/server";
import type { LiveRoomModerationActionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { requireAdmin } from "@/lib/require-admin";
import {
  applyLiveRoomModerationAction,
  getLiveRoomUserRestrictions,
  isLiveRoomHostOrModerator,
  listLiveRoomModerators,
} from "@/lib/trust/live-room-moderation";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      slowModeSeconds: true,
      pinnedModeratorMessage: true,
      pinnedModeratorMessageAt: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await resolveLiveRoomsUserId(req);
  let canModerate = false;
  if (!(auth instanceof NextResponse)) {
    const perm = await isLiveRoomHostOrModerator({ liveRoomId, userId: auth.userId });
    canModerate = perm.canModerate;
  }

  const moderators = canModerate ? await listLiveRoomModerators(liveRoomId) : [];

  let myRestrictions = null;
  if (!(auth instanceof NextResponse)) {
    myRestrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  }

  return NextResponse.json({
    slowModeSeconds: room.slowModeSeconds,
    pinnedModeratorMessage: room.pinnedModeratorMessage,
    pinnedModeratorMessageAt: room.pinnedModeratorMessageAt?.toISOString() ?? null,
    canModerate,
    moderators,
    myRestrictions,
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
