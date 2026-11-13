import { NextResponse } from "next/server";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";
import { confirmAgoraHostLive } from "@/services/agora-room";
import { errorResponse, getStreamRow, requireHostAccess } from "../_shared";

/**
 * POST — host only. The app is publishing in its Agora channel. The first call turns the show live;
 * repeat calls (~every 25 s) are the heartbeat that keeps it live.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const changed = await confirmAgoraHostLive(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (changed) {
      emitStreamStatusChanged(id, {
        streamHealth: row.streamHealth,
        lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
      });
    }
    return NextResponse.json({ ok: true, streamHealth: row.streamHealth });
  } catch (error) {
    return errorResponse(error);
  }
}
