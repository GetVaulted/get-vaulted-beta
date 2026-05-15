import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { reconcileStaleLiveStreamWithRoomStatus, syncLiveRoomStreamFromIvs } from "@/services/ivs";
import { getStreamRow, toBuyerSafeStreamPayload, toHostStreamPayload } from "./_shared";

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
    const session = await getServerSessionSafe();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await getLiveRoomHostAccess(id, session.user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const rl = checkRateLimit(`ivs-stream-sync:${session.user.id}:${id}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many sync requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    try {
      const syncResult = await syncLiveRoomStreamFromIvs(id);
      const reconcileResult = await reconcileStaleLiveStreamWithRoomStatus(id);
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

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ stream: toBuyerSafeStreamPayload(row), viewerRole: "buyer" });
  }

  const access = await getLiveRoomHostAccess(id, session.user.id);
  if (access.ok) {
    return NextResponse.json({ stream: toHostStreamPayload(row), viewerRole: "host" });
  }

  return NextResponse.json({ stream: toBuyerSafeStreamPayload(row), viewerRole: "buyer" });
}
