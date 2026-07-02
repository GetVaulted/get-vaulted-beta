import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getLiveRoomHostAccess } from "@/lib/live-room-host-auth";
import { getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import { prisma } from "@/lib/prisma";
import { emitLiveRoomMessageById, emitTeamBoardChanged } from "@/lib/realtime-emit-server";
import { getTeamBoardPublicPayload } from "@/lib/team-board-public-server";
import { isValidTeamForLeague, normalizeTeamAbbr } from "@/lib/team-board-sets";

type PostBody = { teamAbbr?: string; forUserId?: string | null };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      roomType: true,
      status: true,
      sellerId: true,
      teamBoardLeague: true,
      streamHealth: true,
      streamPaused: true,
      streamMode: true,
      streamStartedAt: true,
      streamEndedAt: true,
      items: {
        where: { status: "active" },
        take: 1,
        select: { teamBoardMisc: true },
      },
    },
  });
  if (!room || room.roomType !== "break") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock(room);
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamAbbrRaw = typeof body.teamAbbr === "string" ? body.teamAbbr : "";
  const teamAbbr = normalizeTeamAbbr(teamAbbrRaw);
  if (!teamAbbr) return NextResponse.json({ error: "teamAbbr is required." }, { status: 400 });

  const access = await getLiveRoomHostAccess(liveRoomId, session.user.id, { requireBreak: true });
  const isHost = access.ok;

  const board = await prisma.liveRoomTeamBoard.findUnique({
    where: { liveRoomId },
    select: {
      league: true,
      visible: true,
      locked: true,
      currentPickerUserId: true,
    },
  });

  if (!board) {
    return NextResponse.json({ error: "Team board is not set up for this room." }, { status: 409 });
  }
  // Room is live (checked above). Do not require `board.visible` — buyers see the board while live; host may still hide it on their stream layout.
  if (board.locked) {
    return NextResponse.json({ error: "Team board is locked." }, { status: 409 });
  }

  const league = room.teamBoardLeague ?? board.league;
  const allowMisc = league === "nfl" && room.items[0]?.teamBoardMisc === true;
  if (!isValidTeamForLeague(league, teamAbbr, { allowMisc })) {
    return NextResponse.json({ error: "Unknown team for this league." }, { status: 400 });
  }

  let targetUserId: string;
  if (isHost) {
    const forUserId =
      typeof body.forUserId === "string" && body.forUserId.trim().length > 0 ? body.forUserId.trim() : null;
    targetUserId = forUserId ?? board.currentPickerUserId ?? "";
    if (!targetUserId) {
      return NextResponse.json({ error: "Set a current picker or pass forUserId." }, { status: 400 });
    }
  } else {
    if (!board.currentPickerUserId || board.currentPickerUserId !== session.user.id) {
      return NextResponse.json({ error: "Only the current picker can select a team." }, { status: 403 });
    }
    if (body.forUserId) {
      return NextResponse.json({ error: "forUserId is only for the host." }, { status: 400 });
    }
    targetUserId = session.user.id;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true },
  });
  if (!targetUser) return NextResponse.json({ error: "User not found." }, { status: 400 });

  try {
    await prisma.liveRoomTeamBoardPick.create({
      data: {
        liveRoomId,
        league,
        teamAbbr,
        userId: targetUser.id,
      },
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "That team is already taken." }, { status: 409 });
    }
    throw e;
  }

  const msg = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: room.sellerId,
      body: `@${targetUser.username} selected ${teamAbbr}`,
      messageType: "system",
    },
    select: { id: true },
  });

  void emitLiveRoomMessageById(msg.id);
  void emitTeamBoardChanged(liveRoomId);

  const payload = await getTeamBoardPublicPayload(liveRoomId);
  if (!payload) {
    return NextResponse.json({ error: "Team board payload missing after pick." }, { status: 500 });
  }
  return NextResponse.json(payload);
}
