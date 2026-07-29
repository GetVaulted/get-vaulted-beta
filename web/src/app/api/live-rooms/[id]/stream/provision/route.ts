import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { formatIvsObsIngestUrl } from "@/lib/ivs-obs-ingest-url";
import { prisma } from "@/lib/prisma";
import { provisionRoomStream } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const provisioned = await provisionRoomStream(id);
    // OBS / RTMP path: buyers must use channel HLS, not Stage WebRTC (no phone publisher).
    await prisma.liveRoom.update({
      where: { id },
      data: { streamMode: "channel_hls" },
    });
    const arn = provisioned.channelArn || (await getStreamRow(id))?.ivsChannelArn;
    if (arn) {
      const { ensureChannelLowLatencyMode } = await import("@/services/ivs");
      // Await so Connect OBS finishes with a LOW-latency channel (NORMAL = 10–30s buyer delay).
      const ok = await ensureChannelLowLatencyMode(arn);
      logIvsOpsServer("ivs_provision_latency_mode", { roomId: id, lowLatencyOk: ok });
    }
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const obsServer = formatIvsObsIngestUrl(provisioned.ingestEndpoint);
    logIvsOpsServer("ivs_provision_success", { roomId: id, streamMode: "channel_hls" });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
      ingest: {
        endpoint: obsServer ?? provisioned.ingestEndpoint,
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
