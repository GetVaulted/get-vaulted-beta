import { NextResponse } from "next/server";
import { resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { getSweet16DraftDto } from "@/lib/live-sweet16-draft";

/** Any viewer: read current Sweet 16 draft state — used for initial load and reconnect resync. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await ctx.params;
  const viewerUserId = await resolveOptionalLiveRoomsUserId(req);

  const draft = await getSweet16DraftDto(itemId, viewerUserId);
  if (!draft) {
    return NextResponse.json({ error: "No draft found for this item." }, { status: 404 });
  }
  return NextResponse.json({ draft });
}
