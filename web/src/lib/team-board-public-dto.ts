import type { TeamBoardLeague } from "@/generated/prisma/client";

export type TeamBoardStateDTO = {
  liveRoomId: string;
  league: TeamBoardLeague;
  visible: boolean;
  locked: boolean;
  currentPickerUserId: string | null;
  currentPickerUsername: string | null;
  updatedAt: string | null;
  suggestedPickerUserId: string | null;
  suggestedPickerUsername: string | null;
};

export type TeamBoardPickDTO = {
  id: string;
  liveRoomId: string;
  league: TeamBoardLeague;
  teamAbbr: string;
  userId: string;
  username: string;
  pickedAt: string;
};

export type TeamBoardPublicPayload = {
  state: TeamBoardStateDTO;
  picks: TeamBoardPickDTO[];
  teams: readonly string[];
};

/** Client-side guard for API JSON (avoids silent no-op when shape is wrong). */
export function parseTeamBoardPublicPayload(raw: unknown): TeamBoardPublicPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const st = o.state;
  if (!st || typeof st !== "object" || Array.isArray(st)) return null;
  const s = st as Record<string, unknown>;
  if (typeof s.liveRoomId !== "string" || !s.liveRoomId) return null;
  if (typeof s.visible !== "boolean") return null;
  if (!Array.isArray(o.teams)) return null;
  if (!Array.isArray(o.picks)) return null;
  return raw as TeamBoardPublicPayload;
}
