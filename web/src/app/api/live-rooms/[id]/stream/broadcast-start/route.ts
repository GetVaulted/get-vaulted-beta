import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { prepareHostWebBroadcastSession } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const session = await prepareHostWebBroadcastSession(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    logIvsOpsServer("ivs_web_broadcast_start", {
      roomId: id,
      streamHealth: row.streamHealth,
      hasPlaybackUrl: Boolean(row.ivsPlaybackUrl),
      streamConfigPreset: session.streamConfigPreset,
    });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
      broadcast: {
        ingestEndpoint: session.ingestEndpoint,
        streamKey: session.streamKeyValue,
        streamConfigPreset: session.streamConfigPreset,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_web_broadcast_start_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
