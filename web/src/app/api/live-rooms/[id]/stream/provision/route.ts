import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { IVS_WHIP_SERVER_URL } from "@/lib/ivs-whip-ingest";
import { prisma } from "@/lib/prisma";
import { prepareObsWhipSession, provisionRoomStream } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";
import { formatIvsObsIngestUrl } from "@/lib/ivs-obs-ingest-url";

type ProvisionBody = {
  /** Default `whip` (OBS → Stage WebRTC). Pass `rtmps` for legacy HLS OBS. */
  protocol?: "whip" | "rtmps";
};

/**
 * Connect OBS for a live room.
 * Default: WHIP → IVS Stage (sub-second for signed-in buyers, HLS mirror for guests).
 * Legacy: `protocol: "rtmps"` keeps the old channel HLS path.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  let body: ProvisionBody = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as ProvisionBody;
  } catch {
    body = {};
  }
  const protocol = body.protocol === "rtmps" ? "rtmps" : "whip";

  try {
    if (protocol === "rtmps") {
      const provisioned = await provisionRoomStream(id);
      await prisma.liveRoom.update({
        where: { id },
        data: { streamMode: "channel_hls" },
      });
      const arn = provisioned.channelArn || (await getStreamRow(id))?.ivsChannelArn;
      if (arn) {
        const { ensureChannelLowLatencyMode } = await import("@/services/ivs");
        const ok = await ensureChannelLowLatencyMode(arn);
        logIvsOpsServer("ivs_provision_latency_mode", { roomId: id, lowLatencyOk: ok });
      }
      const row = await getStreamRow(id);
      if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

      const obsServer = formatIvsObsIngestUrl(provisioned.ingestEndpoint);
      logIvsOpsServer("ivs_provision_success", { roomId: id, streamMode: "channel_hls", protocol: "rtmps" });
      return NextResponse.json({
        ok: true,
        protocol: "rtmps",
        stream: toHostStreamPayload(row),
        ingest: {
          endpoint: obsServer ?? provisioned.ingestEndpoint,
          oneTimeStreamKey: provisioned.streamKeyValue,
        },
      });
    }

    const whip = await prepareObsWhipSession(id, auth.userId);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    logIvsOpsServer("ivs_provision_success", { roomId: id, streamMode: "stage_webrtc", protocol: "whip" });
    return NextResponse.json({
      ok: true,
      protocol: "whip",
      stream: {
        ...toHostStreamPayload(row),
        ingestProtocol: "whip",
        whipServerUrl: IVS_WHIP_SERVER_URL,
      },
      ingest: {
        endpoint: whip.whipServerUrl,
        oneTimeStreamKey: whip.participantToken,
        whipServerUrl: whip.whipServerUrl,
        participantToken: whip.participantToken,
        expiresInSeconds: whip.expiresInSeconds,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_provision_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
      protocol,
    });
    return errorResponse(error);
  }
}
