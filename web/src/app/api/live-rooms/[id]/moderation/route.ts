import { NextResponse } from "next/server";
import type { LiveRoomModerationActionType } from "@/generated/prisma/enums";
import type { LiveRoomModeratorLevel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpKey } from "@/lib/request-rate-limit";
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
  resolveLiveRoomPinnedMessage,
} from "@/lib/trust/live-room-moderation";
import { listAllowedModerationActions } from "@/lib/trust/live-room-moderator-permissions";
import { listLiveRoomTipLedger } from "@/lib/live-tip-ledger";
import { fetchHostRecentSales } from "@/lib/live-room-recent-sales";
import { listUnresolvedPaymentFailuresForRoom } from "@/lib/live-room-payment-failure";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  // Polled every 12s per viewer (useLiveRoomModeration); this is also the heaviest of the
  // live-room GETs per request (room lookup, pinned message, moderator context, moderator
  // roster, and — for staff — mod queue/history/viewers/tips/sales all run sequentially), so
  // unbounded volume here costs more per request than the other polling endpoints. No rate limit
  // existed here before this.
  const pollGate = checkRateLimit(`live-room-moderation-poll:${clientIpKey(req)}:${liveRoomId}`, {
    limit: 4,
    windowMs: 10_000,
  });
  if (!pollGate.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(pollGate.retryAfterMs / 1000)) } },
    );
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      sellerId: true,
      slowModeSeconds: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pinned = await resolveLiveRoomPinnedMessage(liveRoomId);

  const auth = await resolveLiveRoomsUserId(req);
  let modCtx: {
    canModerate: boolean;
    viewerRole: "buyer" | "host" | "moderator";
    moderatorLevel: LiveRoomModeratorLevel | null;
    isHost: boolean;
    isModerator: boolean;
  } = {
    canModerate: false,
    viewerRole: "buyer",
    moderatorLevel: null,
    isHost: false,
    isModerator: false,
  };

  if (!(auth instanceof NextResponse)) {
    const ctxRow = await getLiveRoomModeratorContext({ liveRoomId, userId: auth.userId });
    modCtx = {
      canModerate: ctxRow.canModerate,
      viewerRole: ctxRow.viewerRole,
      moderatorLevel: ctxRow.moderatorLevel,
      isHost: ctxRow.isHost,
      isModerator: ctxRow.isModerator,
    };
  }

  // All viewers need the mod roster for chat badges (purple MOD label); staff get full rows.
  const moderatorRows = await listLiveRoomModerators(liveRoomId);
  const moderators = modCtx.canModerate
    ? moderatorRows
    : moderatorRows.map(({ userId, username }) => ({ userId, username }));

  let myRestrictions = null;
  if (!(auth instanceof NextResponse)) {
    myRestrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  }

  const allowedActions = modCtx.canModerate
    ? listAllowedModerationActions({
        isHost: modCtx.isHost,
        moderatorLevel: modCtx.moderatorLevel,
        isModerator: modCtx.isModerator,
      })
    : [];

  const modHistory = modCtx.canModerate ? await listLiveRoomModHistory(liveRoomId) : [];
  const modQueue = modCtx.canModerate ? await listLiveRoomModQueue(liveRoomId) : [];
  const viewers = modCtx.canModerate ? await listLiveRoomRecentViewers(liveRoomId) : [];
  const tipLedger = modCtx.canModerate ? await listLiveRoomTipLedger(liveRoomId) : null;
  const [recentSales, paymentFailures] = modCtx.canModerate
    ? await Promise.all([
        fetchHostRecentSales(liveRoomId, room.sellerId).catch(() => []),
        listUnresolvedPaymentFailuresForRoom(liveRoomId).catch(() => []),
      ])
    : [[], []];

  const isModerator = modCtx.isModerator;

  return NextResponse.json({
    slowModeSeconds: room.slowModeSeconds,
    pinnedModeratorMessage: pinned.body,
    pinnedModeratorMessageAt: pinned.pinnedAt?.toISOString() ?? null,
    pinnedModeratorMessageExpiresAt: pinned.expiresAt?.toISOString() ?? null,
    pinnedModeratorUserId: pinned.pinnedBy?.userId ?? null,
    pinnedModeratorUsername: pinned.pinnedBy?.username ?? null,
    pinnedModeratorAvatarUrl: pinned.pinnedBy?.avatarUrl ?? null,
    canModerate: modCtx.canModerate,
    isHost: modCtx.isHost,
    isModerator,
    viewerRole: modCtx.viewerRole,
    moderatorLevel: modCtx.moderatorLevel,
    allowedActions,
    sellerId: room.sellerId,
    moderators,
    myRestrictions,
    modHistory,
    modQueue,
    viewers,
    tips: tipLedger?.tips ?? [],
    tipSummary: tipLedger?.summary ?? null,
    recentSales,
    paymentFailures,
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
