import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { getLiveRoomModeratorContext } from "@/lib/trust/live-room-moderation";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import {
  ensureStageHlsCompositionActive,
  reconcileStaleLiveStreamWithRoomStatus,
  syncLiveRoomStreamFromIvs,
} from "@/services/ivs";
import { getStreamRow, toBuyerSafeStreamPayload, toHostStreamPayload } from "./_shared";

/**
 * Guests can never use WebRTC (see `viewerAuthenticated` gating on the client), so they depend
 * entirely on the Stage→Channel HLS mirror. If it never started (or died), self-heal it here —
 * rate-limited per room so many concurrent buyer polls only trigger one retry per window.
 */
function maybeHealStageComposition(roomId: string): void {
  // Allow a forced restart attempt about every 12s while playlist is 404.
  const rl = checkRateLimit(`stage-composition-heal:${roomId}`, { limit: 1, windowMs: 12_000 });
  if (!rl.ok) return;
  void ensureStageHlsCompositionActive(roomId).catch((err) => {
    console.error("[IVS_OPS] stage_composition_heal_error", {
      roomId,
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const row = await getStreamRow(id);
  if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const url = new URL(req.url);
  const wantsSync = url.searchParams.get("sync") === "1" || url.searchParams.get("sync") === "true";

  if (wantsSync) {
    const hostAuth = await requireLiveRoomHostAccess(id, req);
    if (!hostAuth.ok) return hostAuth.response;

    const rl = checkRateLimit(`ivs-stream-sync:${hostAuth.userId}:${id}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many sync requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    try {
      const syncResult = await syncLiveRoomStreamFromIvs(id);
      const reconcileResult = await reconcileStaleLiveStreamWithRoomStatus(id);
      await ensureStageHlsCompositionActive(id);
      logIvsOpsServer("ivs_stream_sync_pull", {
        roomId: id,
        syncUpdated: syncResult?.kind === "updated",
        reconcileUpdated: reconcileResult?.kind === "updated",
      });
    } catch {
      logIvsOpsServer("ivs_stream_sync_pull_error", { roomId: id });
    }

    const refreshed = await getStreamRow(id);
    if (!refreshed) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    return NextResponse.json({ stream: toHostStreamPayload(refreshed), viewerRole: "host" });
  }

  maybeHealStageComposition(id);

  const auth = await resolveLiveRoomsUserId(req);
  const userId = auth instanceof Response ? null : auth.userId;
  if (!userId) {
    return NextResponse.json({ stream: toBuyerSafeStreamPayload(row), viewerRole: "buyer" });
  }
  const access = await getLiveRoomHostAccess(id, userId);
  if (access.ok) {
    return NextResponse.json({ stream: toHostStreamPayload(row), viewerRole: "host" });
  }
  const modCtx = await getLiveRoomModeratorContext({ liveRoomId: id, userId });
  if (modCtx.isModerator) {
    return NextResponse.json({ stream: toBuyerSafeStreamPayload(row), viewerRole: "moderator" });
  }
  return NextResponse.json({ stream: toBuyerSafeStreamPayload(row), viewerRole: "buyer" });
}
