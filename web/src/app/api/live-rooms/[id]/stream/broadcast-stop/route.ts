import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";
import { endHostWebBroadcastSession } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    await endHostWebBroadcastSession(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    // Push the offline/ended health to buyers immediately so their playback clears without
    // waiting on the slower background poll.
    emitStreamStatusChanged(id, {
      streamHealth: row.streamHealth,
      lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
    });

    logIvsOpsServer("ivs_web_broadcast_stop", { roomId: id });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
    });
  } catch (error) {
    logIvsOpsServer("ivs_web_broadcast_stop_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
