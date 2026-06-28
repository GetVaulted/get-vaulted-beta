import { NextResponse } from "next/server";
import { deleteLiveGiveaway, patchLiveGiveawayStatus } from "@/lib/live-giveaway";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomGiveawaysChanged } from "@/lib/realtime-emit-server";

type PatchBody = { action?: string };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; giveawayId: string }> }) {
  const { id: raw, giveawayId: rawGiveawayId } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const giveawayId = decodeURIComponent(rawGiveawayId);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (
    action !== "open_entries" &&
    action !== "close_entries" &&
    action !== "cancel" &&
    action !== "draw"
  ) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = await patchLiveGiveawayStatus(giveawayId, liveRoomId, action);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  emitLiveRoomGiveawaysChanged(liveRoomId);
  return NextResponse.json({
    giveaway: result.giveaway,
    ...("spin" in result && result.spin ? { spin: result.spin } : {}),
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; giveawayId: string }> }) {
  const { id: raw, giveawayId: rawGiveawayId } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);
  const giveawayId = decodeURIComponent(rawGiveawayId);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  const result = await deleteLiveGiveaway(giveawayId, liveRoomId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  emitLiveRoomGiveawaysChanged(liveRoomId);
  return NextResponse.json({ ok: true });
}
