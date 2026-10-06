import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { makeSweet16DraftPick, Sweet16Error } from "@/lib/live-sweet16-draft";

type Body = { teamLabel?: unknown };

/** Buyer: pick a team on your own turn in a live Sweet 16 draft. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: rawRoom, itemId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const teamLabel = typeof body.teamLabel === "string" ? body.teamLabel.trim() : "";
  if (!teamLabel) {
    return NextResponse.json({ error: "Pick a team." }, { status: 400 });
  }

  try {
    const draft = await makeSweet16DraftPick({
      liveRoomId,
      itemId,
      buyerUserId: auth.userId,
      teamLabel,
    });
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof Sweet16Error) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[sweet16-draft/pick] failed", {
      liveRoomId,
      itemId,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Could not record your pick." }, { status: 500 });
  }
}
