import { NextResponse } from "next/server";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { requireAdmin } from "@/lib/require-admin";
import { assignLiveRoomModerator, revokeLiveRoomModerator } from "@/lib/trust/live-room-moderation";

type PostBody = { userId?: string };
type DeleteBody = { userId?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const adminGate = await requireAdmin();

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const result = await assignLiveRoomModerator({
    liveRoomId,
    userId,
    assignedByUserId: auth.userId,
    isAdmin: adminGate.ok,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const adminGate = await requireAdmin();

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: DeleteBody = {};
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    /* empty */
  }

  const userId = body.userId?.trim();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const result = await revokeLiveRoomModerator({
    liveRoomId,
    userId,
    revokedByUserId: auth.userId,
    isAdmin: adminGate.ok,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
