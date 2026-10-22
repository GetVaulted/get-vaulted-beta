import { NextResponse } from "next/server";
import {
  buildWinClipPlaylist,
  loadWinMoment,
  readWinClipPlaylistToken,
} from "@/lib/trust/win-clip-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * HLS playlist for a win clip. Auth is the signed, short-lived token minted for the buyer
 * (video players cannot attach app auth headers). Segment URLs inside are pre-signed S3 links.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const payload = token ? readWinClipPlaylistToken(token) : null;
  if (!payload) return new NextResponse("Link expired.", { status: 401 });

  const moment = await loadWinMoment(payload.k, payload.id, payload.u);
  if (!moment) return new NextResponse("Not found.", { status: 404 });

  const built = await buildWinClipPlaylist(moment).catch(() => null);
  if (!built) return new NextResponse("Video unavailable.", { status: 404 });

  return new NextResponse(built.playlist, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "private, no-store",
    },
  });
}
