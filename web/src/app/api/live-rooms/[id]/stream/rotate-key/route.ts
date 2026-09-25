import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { IVS_WHIP_SERVER_URL, isIvsWhipIngestEndpoint } from "@/lib/ivs-whip-ingest";
import { rotateObsWhipParticipantToken, rotateStreamKey } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const rowBefore = await getStreamRow(id);
    if (!rowBefore) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    if (
      rowBefore.streamMode === "stage_webrtc" &&
      isIvsWhipIngestEndpoint(rowBefore.ivsIngestEndpoint)
    ) {
      const rotated = await rotateObsWhipParticipantToken(id, auth.userId);
      const row = await getStreamRow(id);
      if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
      logIvsOpsServer("ivs_rotate_key_success", { roomId: id, protocol: "whip" });
      return NextResponse.json({
        ok: true,
        protocol: "whip",
        stream: {
          ...toHostStreamPayload(row),
          ingestProtocol: "whip",
          whipServerUrl: IVS_WHIP_SERVER_URL,
        },
        ingest: {
          oneTimeStreamKey: rotated.participantToken,
          whipServerUrl: rotated.whipServerUrl,
          participantToken: rotated.participantToken,
          expiresInSeconds: rotated.expiresInSeconds,
        },
      });
    }

    const rotated = await rotateStreamKey(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    logIvsOpsServer("ivs_rotate_key_success", { roomId: id, protocol: "rtmps" });
    return NextResponse.json({
      ok: true,
      protocol: "rtmps",
      stream: toHostStreamPayload(row),
      ingest: {
        oneTimeStreamKey: rotated.streamKeyValue,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_rotate_key_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
