import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/** How far ahead of start we begin sending the host “get ready” push. */
export const LIVE_HOST_PRESTART_WINDOW_MS = 15 * 60 * 1000;

/** Ignore starts already this close (or past) — “go live now” / late cron ticks. */
export const LIVE_HOST_PRESTART_MIN_LEAD_MS = 60_000;

export type LiveHostPrestartNotifyResult = {
  candidates: number;
  notified: number;
  skipped: number;
};

/**
 * Notify hosts whose scheduled show starts within the next ~15 minutes.
 * Claims `hostPreStartNotifiedAt` before sending so concurrent cron ticks are idempotent.
 */
export async function notifyHostsLiveShowStartingSoon(
  now = new Date(),
): Promise<LiveHostPrestartNotifyResult> {
  const windowEnd = new Date(now.getTime() + LIVE_HOST_PRESTART_WINDOW_MS);
  const minStart = new Date(now.getTime() + LIVE_HOST_PRESTART_MIN_LEAD_MS);

  const candidates = await prisma.liveRoom.findMany({
    where: {
      status: "scheduled",
      hostPreStartNotifiedAt: null,
      scheduledStartAt: {
        gte: minStart,
        lte: windowEnd,
      },
    },
    select: {
      id: true,
      title: true,
      sellerId: true,
      scheduledStartAt: true,
    },
    take: 100,
    orderBy: { scheduledStartAt: "asc" },
  });

  let notified = 0;
  let skipped = 0;

  for (const room of candidates) {
    const claimed = await prisma.liveRoom.updateMany({
      where: {
        id: room.id,
        status: "scheduled",
        hostPreStartNotifiedAt: null,
      },
      data: { hostPreStartNotifiedAt: now },
    });
    if (claimed.count !== 1) {
      skipped += 1;
      continue;
    }

    const title = room.title.trim() || "Your show";
    const id = await createNotification(prisma, {
      userId: room.sellerId,
      type: "live_host_starting_soon",
      title: "Get ready — your show is starting soon",
      body: `"${title.slice(0, 80)}" goes live in about 15 minutes. Hop in, check your stream, and get hyped.`,
      href: `/seller/live/${encodeURIComponent(room.id)}/console`,
    });
    if (id) notified += 1;
    else skipped += 1;
  }

  return { candidates: candidates.length, notified, skipped };
}
