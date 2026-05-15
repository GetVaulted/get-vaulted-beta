import { NextResponse } from "next/server";
import { stopStream } from "@/services/ivs";
import { errorResponse, getStreamRow, requireHostAccess, toHostStreamPayload } from "../_shared";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const auth = await requireHostAccess(id);
  if (!auth.ok) return auth.response;

  try {
    await stopStream(id);
    const row = await getStreamRow(id);
    if (!row) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      stream: toHostStreamPayload(row),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
