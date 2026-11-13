import { NextResponse } from "next/server";
import { extractClientIp } from "@/lib/ip-capture";
import { checkRateLimit } from "@/lib/request-rate-limit";
import { createAgoraViewerSession, isAgoraConfigured } from "@/services/agora-rtc";
import { getStreamRow } from "../_shared";

/**
 * GET — anyone watching (signed in or guest). Returns a subscribe-only Agora pass for the room.
 * The pass cannot publish. Rate-limited per IP; only served for rooms that are on Agora.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const ip = extractClientIp(req) ?? "unknown";
  const rl = checkRateLimit(`agora-viewer:${ip}:${id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  if (!isAgoraConfigured()) {
    return NextResponse.json({ error: "Live video is not available right now." }, { status: 503 });
  }

  const row = await getStreamRow(id);
  if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (row.streamProvider !== "agora_rtc") {
    return NextResponse.json({ error: "This room is not streaming over Agora." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, agora: createAgoraViewerSession(id) });
}
