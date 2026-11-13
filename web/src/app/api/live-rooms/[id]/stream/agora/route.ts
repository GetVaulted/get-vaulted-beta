import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";
import {
  endAgoraHostSession,
  prepareAgoraHostSession,
  refreshAgoraHostSession,
  resolveHostPublisher,
} from "@/services/agora-room";
import {
  errorResponse,
  getStreamRow,
  requireHostAccess,
  requireSellerTermsToStart,
  toHostStreamPayload,
} from "../_shared";

/**
 * POST — host only. Start a phone broadcast on Agora: mark the room as an Agora show and return the
 * host's join details. The app then joins the channel and calls `live` once it is publishing.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;
  const termsBlock = await requireSellerTermsToStart(id, auth);
  if (termsBlock) return termsBlock;

  if ((await resolveHostPublisher(id)) !== "agora") {
    return NextResponse.json(
      { error: "Backup live video is not active for this room.", code: "AGORA_NOT_ACTIVE" },
      { status: 409 },
    );
  }

  try {
    const agora = await prepareAgoraHostSession(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    emitStreamStatusChanged(id, {
      streamHealth: row.streamHealth,
      lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
    });
    return NextResponse.json({ ok: true, stream: toHostStreamPayload(row), agora });
  } catch (error) {
    logIvsOpsServer("agora_host_session_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}

/** PATCH — host only. Fresh Agora token for a running broadcast (token about to expire / reconnect). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ ok: true, agora: refreshAgoraHostSession(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — host only. Host stopped broadcasting. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    await endAgoraHostSession(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    emitStreamStatusChanged(id, {
      streamHealth: row.streamHealth,
      lastStatusSyncAt: (row.lastIvsStatusSyncAt ?? new Date()).toISOString(),
    });
    return NextResponse.json({ ok: true, stream: toHostStreamPayload(row) });
  } catch (error) {
    return errorResponse(error);
  }
}
