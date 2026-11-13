import { NextResponse } from "next/server";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { ensureAgoraRelay } from "@/services/agora-room";
import { errorResponse, requireHostAccess } from "../../_shared";

/**
 * POST — host only. Call after the phone has joined the Agora channel (and after any reconnect):
 * starts, or keeps, the Agora -> Cloudflare relay that buyers watch as HLS.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const relay = await ensureAgoraRelay(id);
    return NextResponse.json({ ok: true, relay: { state: relay.state, started: relay.started } });
  } catch (error) {
    logIvsOpsServer("agora_relay_failure", {
      roomId: id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(error);
  }
}
