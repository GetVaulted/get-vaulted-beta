import { NextResponse } from "next/server";
import { getAgoraConfig } from "@/services/agora-rtc";
import { resolveHostPublisher } from "@/services/agora-room";
import { requireHostAccess } from "../_shared";

/**
 * GET — host only. Which sender the phone should use for this room: the AWS IVS Stage publisher
 * (default) or the backup real-time provider (Agora -> Cloudflare). The app calls this before it
 * opens the camera preview so it mounts the right publisher.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id, req);
  if (!auth.ok) return auth.response;

  try {
    const publisher = await resolveHostPublisher(id);
    // The Agora App ID is public (it ships in every client); the app needs it to open the camera
    // preview before a session exists. Certificate and REST credentials never leave the server.
    const agoraAppId = publisher === "agora" ? (getAgoraConfig()?.appId ?? null) : null;
    return NextResponse.json({ ok: true, publisher: agoraAppId ? publisher : "aws_ivs", agoraAppId });
  } catch {
    // Never block hosting on a lookup failure: AWS is the default sender.
    return NextResponse.json({ ok: true, publisher: "aws_ivs" });
  }
}
