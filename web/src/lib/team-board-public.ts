/**
 * Client-safe team board types + JSON parsing only.
 * Server code must import `getTeamBoardPublicPayload` from `@/lib/team-board-public-server`
 * so Prisma never enters the browser bundle.
 */
export type { TeamBoardPickDTO, TeamBoardPublicPayload, TeamBoardStateDTO } from "@/lib/team-board-public-dto";
export { parseTeamBoardPublicPayload } from "@/lib/team-board-public-dto";
