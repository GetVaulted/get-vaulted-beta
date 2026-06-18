import { NextResponse } from "next/server";
import {
  createLiveGiveaway,
  listLiveGiveawaysForRoom,
  parseCreateGiveawayBody,
} from "@/lib/live-giveaway";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomGiveawaysChanged } from "@/lib/realtime-emit-server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  const includeHostSecrets = !(hostAuth instanceof NextResponse);

  const giveaways = await listLiveGiveawaysForRoom(liveRoomId, includeHostSecrets);
  return NextResponse.json({ giveaways });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { userId, room } = hostAuth;
  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCreateGiveawayBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid giveaway payload." }, { status: 400 });
  }

  const result = await createLiveGiveaway({
    liveRoomId,
    createdById: userId,
    kind: parsed.kind,
    title: parsed.title,
    prizeDescription: parsed.prizeDescription,
    imageUrl: parsed.imageUrl,
    rulesText: parsed.rulesText,
    openEntries: parsed.openEntries,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  emitLiveRoomGiveawaysChanged(liveRoomId);
  return NextResponse.json({ giveaway: result.giveaway }, { status: 201 });
}
