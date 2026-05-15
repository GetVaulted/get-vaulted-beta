import { prisma } from "@/lib/prisma";
import type { BreakFormat, LiveRoom } from "@/generated/prisma/client";

export async function getLiveRoomHostAccess(
  liveRoomId: string,
  userId: string,
  opts?: { requireBreak?: boolean },
): Promise<
  | { ok: true; room: LiveRoom; isAdmin: boolean }
  | { ok: false; status: 404 | 403; error: string }
> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
  });
  if (!room) return { ok: false, status: 404, error: "Room not found." };

  if (opts?.requireBreak && room.roomType !== "break") {
    return { ok: false, status: 403, error: "Host console is only for break rooms." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, suspendedAt: true },
  });
  if (user?.suspendedAt) {
    return { ok: false, status: 403, error: "Account suspended." };
  }

  const isAdmin = user?.role === "admin";
  if (room.sellerId !== userId && !isAdmin) {
    return { ok: false, status: 403, error: "Only the room host or an admin can do this." };
  }

  return { ok: true, room, isAdmin };
}

export function parseTeamLabelsJson(raw: string): string[] {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim().slice(0, 200));
  } catch {
    return [];
  }
}

export function stringifyTeamLabels(labels: string[]): string {
  return JSON.stringify(labels.map((s) => s.trim().slice(0, 200)).filter(Boolean));
}

export const BREAK_FORMATS: BreakFormat[] = ["pick_your_team", "random_teams", "random_divisions"];

export function parseBreakFormat(v: string): BreakFormat | null {
  if (v === "pick_your_team" || v === "random_teams" || v === "random_divisions") return v;
  return null;
}
