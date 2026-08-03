import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { requireLiveRoomHostAccess } from "@/lib/resolve-live-host-access";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { getLiveRoomModeratorContext } from "@/lib/trust/live-room-moderation";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import {
  ensureStageHlsCompositionActive,
  reconcileStagePublisherHealth,
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
  const rl = checkRateLimit(`stage-composition-heal:${roomId}`, { limit: 1, windowMs: 30_000 });
  if (!rl.ok) return;
  void ensureStageHlsCompositionActive(roomId).catch(() => {});
}

/** Keep streamHealth honest from Stage publishers (not the lagging HLS channel). */
function maybeReconcileStagePublisherHealth(roomId: string): void {
  const rl = checkRateLimit(`stage-publisher-health:${roomId}`, { limit: 1, windowMs: 15_000 });
  if (!rl.ok) return;
  void reconcileStagePublisherHealth(roomId).catch(() => {});
}

/** Keep channel_hls `streamHealth` honest from IVS GetStream (OBS path has no Stage publisher). */
async function maybeSyncChannelHlsHealth(row: Awaited<ReturnType<typeof getStreamRow>>): Promise<
  NonNullable<Awaited<ReturnType<typeof getStreamRow>>> | null
> {
  if (!row) return null;
  if (row.streamMode !== "channel_hls" || !row.ivsChannelArn) return row;
  if (row.streamHealth === "ended" || row.streamHealth === "not_provisioned") return row;
  // Already live and recently synced — skip AWS call.
  const syncedAt = row.lastIvsStatusSyncAt?.getTime() ?? 0;
  const staleMs = Date.now() - syncedAt;
  if (row.streamHealth === "live" && staleMs < 20_000) return row;
  const rl = checkRateLimit(`channel-hls-health:${row.id}`, { limit: 1, windowMs: 12_000 });
  if (!rl.ok) return row;
  try {
    await syncLiveRoomStreamFromIvs(row.id);
    logIvsOpsServer("ivs_channel_hls_buyer_sync", { roomId: row.id, previousHealth: row.streamHealth });
    return (await getStreamRow(row.id)) ?? row;
  } catch {
    logIvsOpsServer("ivs_channel_hls_buyer_sync_error", { roomId: row.id });
    return row;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  let row = await getStreamRow(id);
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
      await reconcileStagePublisherHealth(id);
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

  // OBS / channel_hls: buyers previously only saw DB health. Without host ?sync=1 or the IVS
  // webhook, streamHealth stayed offline while OBS was already encoding. Throttled GetStream
  // keeps playbackUrl + health honest for the HLS path.
  row = (await maybeSyncChannelHlsHealth(row)) ?? row;

  // Guests / in-app mini depend on Stage→Channel HLS. Prefer an explicit heal request
  // (mini player recovery) over the soft poll throttle so Back→float can restart a dead mirror.
  const wantsHeal =
    url.searchParams.get("heal") === "1" || url.searchParams.get("heal") === "true";
  if (wantsHeal) {
    const rl = checkRateLimit(`stage-composition-heal-force:${id}`, { limit: 4, windowMs: 60_000 });
    if (rl.ok) {
      void ensureStageHlsCompositionActive(id).catch(() => {});
    }
  } else {
    maybeHealStageComposition(id);
  }
  maybeReconcileStagePublisherHealth(id);

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
