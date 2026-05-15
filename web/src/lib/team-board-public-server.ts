import type { TeamBoardLeague } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TEAM_BOARD_SETS, teamBoardLeagueKey } from "@/lib/team-board-sets";
import type { TeamBoardPickDTO, TeamBoardPublicPayload, TeamBoardStateDTO } from "@/lib/team-board-public-dto";

export type { TeamBoardPickDTO, TeamBoardPublicPayload, TeamBoardStateDTO } from "@/lib/team-board-public-dto";

async function latestSpotClaimPicker(liveRoomId: string): Promise<{ userId: string; username: string } | null> {
  const row = await prisma.breakSpot.findFirst({
    where: { liveRoomId },
    orderBy: { createdAt: "desc" },
    select: { userId: true, user: { select: { username: true } } },
  });
  if (!row) return null;
  return { userId: row.userId, username: row.user.username };
}

export async function getTeamBoardPublicPayload(liveRoomId: string): Promise<TeamBoardPublicPayload | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    select: {
      id: true,
      roomType: true,
      teamBoardLeague: true,
      items: {
        where: { status: "active" },
        take: 1,
        select: { teamBoardMisc: true },
      },
    },
  });
  if (!room || room.roomType !== "break") return null;

  const suggested = await latestSpotClaimPicker(liveRoomId);

  const board = await prisma.liveRoomTeamBoard.findUnique({
    where: { liveRoomId },
    include: {
      currentPicker: { select: { username: true } },
      picks: {
        where: {},
        orderBy: { pickedAt: "asc" },
        include: { user: { select: { username: true } } },
      },
    },
  });

  const league: TeamBoardLeague = room.teamBoardLeague ?? board?.league ?? "nba";
  const activeMisc = room.items[0]?.teamBoardMisc === true;
  const includeMisc = league === "nfl" && activeMisc;
  const base = TEAM_BOARD_SETS[teamBoardLeagueKey(league)];
  const teams = includeMisc ? [...base, "MISC"] : [...base];

  const state: TeamBoardStateDTO = {
    liveRoomId,
    league,
    visible: board?.visible ?? false,
    locked: board?.locked ?? false,
    currentPickerUserId: board?.currentPickerUserId ?? null,
    currentPickerUsername: board?.currentPicker?.username?.trim() || null,
    updatedAt: board?.updatedAt?.toISOString() ?? null,
    suggestedPickerUserId: suggested?.userId ?? null,
    suggestedPickerUsername: suggested ? `@${suggested.username}` : null,
  };

  const picksForLeague = (board?.picks ?? []).filter((p) => p.league === league);

  const picks: TeamBoardPickDTO[] = picksForLeague.map((p) => ({
    id: p.id,
    liveRoomId: p.liveRoomId,
    league: p.league,
    teamAbbr: p.teamAbbr,
    userId: p.userId,
    username: p.user.username,
    pickedAt: p.pickedAt.toISOString(),
  }));

  return { state, picks, teams };
}
