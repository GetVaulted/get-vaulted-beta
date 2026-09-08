import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import {
  createViewerStageToken,
  endHostStageSession,
  prepareHostStageSession,
  refreshHostStageToken,
} from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

/** Server kill-switch: when "false", WebRTC Stages are disabled and clients fall back to HLS. */
function stageEnabled(): boolean {
  return process.env.LIVE_STAGE_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * POST — host only. Provision the Stage, mark the room live (stage mode), start the optional HLS
 * mirror, and return the host's publish token. Mirrors the broadcast-start route's auth + realtime.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  if (!stageEnabled()) {
    return NextResponse.json({ error: "Real-Time streaming is disabled." }, { status: 503 });
  }

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const token = await prepareHostStageSession(id, auth.userId);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    emitStreamStatusChanged(id, {
      streamHealth: row.streamHealth,
      lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
    });

    logIvsOpsServer("ivs_stage_token_host", { roomId: id });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
      stage: {
        token: token.token,
        participantId: token.participantId,
        stageArn: token.stageArn,
        expiresInSeconds: token.expiresInSeconds,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_stage_token_host_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}

/**
 * GET — authenticated viewer. Returns a subscribe-only participant token. Guests / unauthenticated
 * requests get 401 and the client falls back to HLS playback.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  if (!stageEnabled()) {
    return NextResponse.json({ error: "Real-Time streaming is disabled." }, { status: 503 });
  }

  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const row = await getStreamRow(id);
  if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (!row.ivsStageArn) {
    return NextResponse.json({ error: "This room is not streaming over WebRTC." }, { status: 409 });
  }

  try {
    const token = await createViewerStageToken(id, auth.userId);
    return NextResponse.json({
      ok: true,
      stage: {
        token: token.token,
        participantId: token.participantId,
        stageArn: token.stageArn,
        expiresInSeconds: token.expiresInSeconds,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_stage_token_viewer_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}

/**
 * PATCH — host only. Mint a fresh publish token for an in-progress Stage broadcast without ending
 * the session. Used when the host's WebRTC connection drops mid-show.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  if (!stageEnabled()) {
    return NextResponse.json({ error: "Real-Time streaming is disabled." }, { status: 503 });
  }

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const token = await refreshHostStageToken(id, auth.userId);
    logIvsOpsServer("ivs_stage_token_host_refresh", { roomId: id });
    return NextResponse.json({
      ok: true,
      stage: {
        token: token.token,
        participantId: token.participantId,
        stageArn: token.stageArn,
        expiresInSeconds: token.expiresInSeconds,
      },
    });
  } catch (error) {
    logIvsOpsServer("ivs_stage_token_host_refresh_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}

/** DELETE — host only. End the Stage broadcast: stop the HLS mirror and mark the stream ended. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    await endHostStageSession(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    emitStreamStatusChanged(id, {
      streamHealth: row.streamHealth,
      lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
    });

    logIvsOpsServer("ivs_stage_token_end", { roomId: id });
    return NextResponse.json({ ok: true, stream: toHostStreamPayload(row) });
  } catch (error) {
    logIvsOpsServer("ivs_stage_token_end_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
