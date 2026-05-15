import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { prisma } from "@/lib/prisma";
import { parseTeamBoardLeague } from "@/lib/team-board-sets";
import { getTeamBoardPublicPayload } from "@/lib/team-board-public-server";
import { emitTeamBoardChanged } from "@/lib/realtime-emit-server";
import type { TeamBoardLeague } from "@/generated/prisma/client";

type PatchBody = {
  league?: string;
  visible?: boolean;
  locked?: boolean;
  currentPickerUserId?: string | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const payload = await getTeamBoardPublicPayload(liveRoomId);
  if (!payload) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(payload);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: { status: true, roomType: true, teamBoardLeague: true },
  });
  if (!room) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (room.status === "ended") {
    return NextResponse.json({ error: "Room has ended." }, { status: 409 });
  }

  let nextLeague: TeamBoardLeague | undefined;
  if (typeof body.league === "string") {
    const p = parseTeamBoardLeague(body.league);
    if (!p) return NextResponse.json({ error: "Invalid league." }, { status: 400 });
    nextLeague = p;
  }

  if (body.currentPickerUserId !== undefined && body.currentPickerUserId !== null) {
    const uid = String(body.currentPickerUserId).trim();
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { id: true } });
    if (!u) return NextResponse.json({ error: "Picker user not found." }, { status: 400 });
  }

  const update: {
    league?: TeamBoardLeague;
    visible?: boolean;
    locked?: boolean;
    currentPickerUserId?: string | null;
  } = {};

  if (nextLeague !== undefined) update.league = nextLeague;
  if (typeof body.visible === "boolean") update.visible = body.visible;
  if (typeof body.locked === "boolean") update.locked = body.locked;
  if (body.currentPickerUserId !== undefined) {
    update.currentPickerUserId =
      body.currentPickerUserId === null || body.currentPickerUserId === ""
        ? null
        : String(body.currentPickerUserId).trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  try {
    await prisma.liveRoomTeamBoard.upsert({
      where: { liveRoomId },
      create: {
        liveRoomId,
        league: nextLeague ?? room.teamBoardLeague,
        visible: typeof body.visible === "boolean" ? body.visible : false,
        locked: typeof body.locked === "boolean" ? body.locked : false,
        currentPickerUserId:
          body.currentPickerUserId !== undefined
            ? body.currentPickerUserId === null || body.currentPickerUserId === ""
              ? null
              : String(body.currentPickerUserId).trim()
            : null,
      },
      update,
    });
    if (nextLeague !== undefined) {
      await prisma.liveRoom.update({
        where: { id: liveRoomId },
        data: { teamBoardLeague: nextLeague },
      });
    }
  } catch (e) {
    console.error("[team-board PATCH] upsert", liveRoomId, e);
    const msg = e instanceof Error ? e.message : "Database error.";
    return NextResponse.json(
      {
        error:
          /LiveRoomTeamBoard|no such table/i.test(msg)
            ? "Team board tables are missing. Run: npx prisma migrate dev (or deploy migrations), then restart the dev server."
            : msg,
      },
      { status: 500 },
    );
  }

  void emitTeamBoardChanged(liveRoomId);

  const payload = await getTeamBoardPublicPayload(liveRoomId);
  if (!payload) {
    return NextResponse.json({ error: "Team board is unavailable for this room." }, { status: 500 });
  }
  return NextResponse.json(payload);
}
