import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import {
  buildWinClipPlaylist,
  loadWinMoment,
  makeWinClipPlaylistToken,
} from "@/lib/trust/win-clip-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Resolve one win into a playable clip. Returns a short-lived playlist URL for the player. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, id } = await ctx.params;
  if (kind !== "spot" && kind !== "order") {
    return NextResponse.json({ error: "Unknown win type." }, { status: 400 });
  }
  const moment = await loadWinMoment(kind, decodeURIComponent(id), session.user.id);
  if (!moment) return NextResponse.json({ error: "Win not found." }, { status: 404 });

  let built;
  try {
    built = await buildWinClipPlaylist(moment);
  } catch (e) {
    console.error("[win-clip] build failed", { kind, id, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Could not load the video right now. Try again soon." }, { status: 502 });
  }
  if (!built) {
    return NextResponse.json(
      { error: "The video for this moment is no longer available." },
      { status: 404 },
    );
  }

  const { token, expiresAt } = makeWinClipPlaylistToken(moment);
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    title: moment.title,
    subtitle: moment.subtitle,
    showTitle: moment.showTitle,
    wonAt: new Date(moment.momentMs).toISOString(),
    playlistUrl: `${origin}/api/live/win-clips/playlist?token=${encodeURIComponent(token)}`,
    expiresAt,
    momentOffsetSec: built.momentOffsetSec,
    durationSec: built.durationSec,
  });
}
