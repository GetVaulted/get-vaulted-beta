import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { autoEndRoom } from "@/lib/live-stuck-recovery-service";
import { logIvsOpsServer } from "@/lib/ivs-ops-log";
import { prisma } from "@/lib/prisma";

/** Default: a show paused for 60 minutes is ended automatically. */
export const PAUSED_AUTO_END_DEFAULT_MINUTES = 60;

/** Kill switch — set LIVE_PAUSED_AUTO_END_ENABLED=false to disable the safety net. */
export function pausedAutoEndEnabled(): boolean {
  return process.env.LIVE_PAUSED_AUTO_END_ENABLED?.trim().toLowerCase() !== "false";
}

/** Minutes a show may stay paused before it is ended (env LIVE_PAUSED_AUTO_END_MINUTES, default 60). */
export function pausedAutoEndMinutes(): number {
  const n = Number(process.env.LIVE_PAUSED_AUTO_END_MINUTES?.trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : PAUSED_AUTO_END_DEFAULT_MINUTES;
}

export type PausedRoomDecision = "ignore" | "start_clock" | "end";

/**
 * - not paused → ignore
 * - paused but no timestamp (paused before this safety net existed) → start the clock now
 * - paused for at least the threshold → end
 */
export function decidePausedRoom(args: {
  streamPaused: boolean;
  streamPausedAt: Date | null;
  nowMs: number;
  thresholdMs: number;
}): PausedRoomDecision {
  if (!args.streamPaused) return "ignore";
  if (!args.streamPausedAt) return "start_clock";
  return args.nowMs - args.streamPausedAt.getTime() >= args.thresholdMs ? "end" : "ignore";
}

export type PausedAutoEndSummary = {
  scanned: number;
  clocksStarted: number;
  ended: number;
  endedRoomIds: string[];
};

/**
 * Safety net: end any `live` show whose video has been paused for the threshold or longer.
 * Uses the same status-guarded end as the zombie-show recovery job (ends the room, tears down the
 * stage/composition, finalizes the replay). Idempotent; never throws per room.
 */
export async function endLongPausedLiveRooms(now: Date = new Date()): Promise<PausedAutoEndSummary> {
  const summary: PausedAutoEndSummary = { scanned: 0, clocksStarted: 0, ended: 0, endedRoomIds: [] };
  if (!pausedAutoEndEnabled()) return summary;

  const minutes = pausedAutoEndMinutes();
  const thresholdMs = minutes * 60_000;

  const rooms = await prisma.liveRoom.findMany({
    where: { status: "live", streamPaused: true },
    select: {
      id: true,
      title: true,
      sellerId: true,
      streamPaused: true,
      streamPausedAt: true,
      completedSalesGmvUsd: true,
    },
  });

  for (const room of rooms) {
    summary.scanned += 1;
    try {
      const decision = decidePausedRoom({
        streamPaused: room.streamPaused,
        streamPausedAt: room.streamPausedAt,
        nowMs: now.getTime(),
        thresholdMs,
      });

      if (decision === "start_clock") {
        const stamped = await prisma.liveRoom.updateMany({
          where: { id: room.id, status: "live", streamPaused: true, streamPausedAt: null },
          data: { streamPausedAt: now },
        });
        if (stamped.count > 0) summary.clocksStarted += 1;
        continue;
      }
      if (decision !== "end") continue;

      const didEnd = await autoEndRoom(room.id, room.completedSalesGmvUsd);
      if (!didEnd) continue;
      summary.ended += 1;
      summary.endedRoomIds.push(room.id);
      logIvsOpsServer("live_paused_auto_ended", { roomId: room.id, pausedMinutes: minutes });

      const seller = await prisma.user.findUnique({ where: { id: room.sellerId }, select: { username: true } });
      scheduleNotifyAdmins({
        type: "admin_live_paused_auto_end",
        title: `Paused show ended · @${seller?.username ?? "seller"}`,
        body: `${room.title} was paused for over ${minutes} minutes, so it was ended automatically.`,
        href: "/admin/live-shows",
        dedupeKey: `admin_live_paused_auto_end:${room.id}`,
      });
    } catch (e) {
      console.error("[live-paused-auto-end] room sweep failed", room.id, e);
    }
  }

  return summary;
}
