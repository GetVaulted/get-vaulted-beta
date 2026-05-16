import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { provisionRoomStream } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const provisioned = await provisionRoomStream(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    logIvsOpsServer("ivs_provision_success", { roomId: id });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
      ingest: {
        endpoint: provisioned.ingestEndpoint,
        oneTimeStreamKey: provisioned.streamKeyValue,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_provision_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
