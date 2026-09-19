import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { emitLiveDiscoveryChanged } from "@/lib/realtime-emit-server";
import { liveShowEndGmvFields } from "@/lib/live-show-gmv";

/**
 * Scheduled-show host reminders (T−30 / T−5 / "go live now") and the no-show auto-cancel.
 *
 * Sibling to `live-host-prestart-notify.ts`, which already owns the T−15 reminder on
 * `hostPreStartNotifiedAt` — left untouched here. Each reminder below claims its own
 * `hostXNotifiedAt` timestamp before sending (same idempotent claim-then-notify pattern), so
 * concurrent/overlapping cron ticks never double-send. All of these are wired into the same
 * `/api/cron/live-host-prestart` cron tick (every ~5 minutes) so no new external cron entry is
 * needed — see that route for the call sites.
 */

export type ReminderRunResult = { candidates: number; notified: number; skipped: number };

/**
 * How far ahead of start the T−30 reminder fires (24–32 min out). Deliberately wider than the
 * ~5-minute cron cadence — a window narrower than the polling gap can be skipped entirely if a
 * room's `scheduledStartAt` doesn't happen to align with tick timing, or a tick runs late.
 */
export const LIVE_HOST_T30_WINDOW_MS = 32 * 60 * 1000;
export const LIVE_HOST_T30_MIN_LEAD_MS = 24 * 60 * 1000;

/** How far ahead of start the T−5 reminder fires (1–8 min out — see T−30 comment on window width). */
export const LIVE_HOST_T5_WINDOW_MS = 8 * 60 * 1000;
export const LIVE_HOST_T5_MIN_LEAD_MS = 60_000;

/** No-show auto-cancel threshold: an hour past `scheduledStartAt` with the show still `scheduled`. */
export const LIVE_HOST_AUTO_CANCEL_AFTER_MS = 60 * 60 * 1000;

async function claimAndNotify(args: {
  candidates: Array<{ id: string; title: string; sellerId: string }>;
  notifiedField: "hostT30NotifiedAt" | "hostT5NotifiedAt" | "hostGoLiveNotifiedAt";
  now: Date;
  type: string;
  title: string;
  bodyFor: (title: string) => string;
}): Promise<ReminderRunResult> {
  let notified = 0;
  let skipped = 0;

  for (const room of args.candidates) {
    const claimed = await prisma.liveRoom.updateMany({
      where: { id: room.id, status: "scheduled", [args.notifiedField]: null },
      data: { [args.notifiedField]: args.now },
    });
    if (claimed.count !== 1) {
      skipped += 1;
      continue;
    }

    const title = room.title.trim() || "Your show";
    const id = await createNotification(prisma, {
      userId: room.sellerId,
      type: args.type,
      title: args.title,
      body: args.bodyFor(title),
      href: `/seller/live/${encodeURIComponent(room.id)}/console`,
    });
    if (id) notified += 1;
    else skipped += 1;
  }

  return { candidates: args.candidates.length, notified, skipped };
}

/** Notify hosts whose scheduled show starts in about 24–32 minutes. */
export async function notifyHostsShowStartingT30(now = new Date()): Promise<ReminderRunResult> {
  const candidates = await prisma.liveRoom.findMany({
    where: {
      status: "scheduled",
      hostT30NotifiedAt: null,
      scheduledStartAt: {
        gte: new Date(now.getTime() + LIVE_HOST_T30_MIN_LEAD_MS),
        lte: new Date(now.getTime() + LIVE_HOST_T30_WINDOW_MS),
      },
    },
    select: { id: true, title: true, sellerId: true },
    take: 100,
    orderBy: { scheduledStartAt: "asc" },
  });

  return claimAndNotify({
    candidates,
    notifiedField: "hostT30NotifiedAt",
    now,
    type: "live_host_starting_soon",
    title: "Your show starts in 30 minutes",
    bodyFor: (title) => `"${title.slice(0, 80)}" goes live in about 30 minutes. Get your stream and inventory ready.`,
  });
}

/** Notify hosts whose scheduled show starts in about 1–8 minutes. */
export async function notifyHostsShowStartingT5(now = new Date()): Promise<ReminderRunResult> {
  const candidates = await prisma.liveRoom.findMany({
    where: {
      status: "scheduled",
      hostT5NotifiedAt: null,
      scheduledStartAt: {
        gte: new Date(now.getTime() + LIVE_HOST_T5_MIN_LEAD_MS),
        lte: new Date(now.getTime() + LIVE_HOST_T5_WINDOW_MS),
      },
    },
    select: { id: true, title: true, sellerId: true },
    take: 100,
    orderBy: { scheduledStartAt: "asc" },
  });

  return claimAndNotify({
    candidates,
    notifiedField: "hostT5NotifiedAt",
    now,
    type: "live_host_starting_soon",
    title: "5 minutes to go live",
    bodyFor: (title) => `"${title.slice(0, 80)}" goes live in about 5 minutes. Get into your host console.`,
  });
}

/**
 * Notify hosts once their scheduled start time has arrived and they still haven't gone live.
 * Stays eligible for the same hour the no-show auto-cancel grace period covers — past that, the
 * show gets auto-cancelled instead (see `autoCancelNoShowScheduledShows`).
 */
export async function notifyHostsGoLiveNow(now = new Date()): Promise<ReminderRunResult> {
  const candidates = await prisma.liveRoom.findMany({
    where: {
      status: "scheduled",
      hostGoLiveNotifiedAt: null,
      scheduledStartAt: {
        lte: now,
        gte: new Date(now.getTime() - LIVE_HOST_AUTO_CANCEL_AFTER_MS),
      },
    },
    select: { id: true, title: true, sellerId: true },
    take: 100,
    orderBy: { scheduledStartAt: "asc" },
  });

  return claimAndNotify({
    candidates,
    notifiedField: "hostGoLiveNotifiedAt",
    now,
    type: "live_host_go_live_now",
    title: "It's time to go live",
    bodyFor: (title) =>
      `"${title.slice(0, 80)}" is scheduled to start now. Open your host console and go live.`,
  });
}

export type AutoCancelResult = { candidates: number; cancelled: number; skipped: number };

/**
 * Cancels scheduled shows that never went live within an hour of `scheduledStartAt`, freeing the
 * seller to schedule a new show. Mirrors the seller's own self-service cancel
 * (`POST /api/live-rooms/[id]` action=cancel) — same `status → "ended"` transition and
 * `reason: "cancelled"` discovery event — minus the stage-teardown/replay calls, since a show that
 * never went live has no stage session or replay to close out.
 */
export async function autoCancelNoShowScheduledShows(now = new Date()): Promise<AutoCancelResult> {
  const cutoff = new Date(now.getTime() - LIVE_HOST_AUTO_CANCEL_AFTER_MS);

  const candidates = await prisma.liveRoom.findMany({
    where: {
      status: "scheduled",
      autoCancelledAt: null,
      scheduledStartAt: { lte: cutoff },
    },
    select: { id: true, title: true, sellerId: true, completedSalesGmvUsd: true },
    take: 100,
    orderBy: { scheduledStartAt: "asc" },
  });

  let cancelled = 0;
  let skipped = 0;

  for (const room of candidates) {
    const claimed = await prisma.liveRoom.updateMany({
      where: { id: room.id, status: "scheduled", autoCancelledAt: null },
      data: {
        status: "ended",
        endedAt: now,
        autoCancelledAt: now,
        viewerCount: 0,
        viewerCountUpdatedAt: now,
        ...liveShowEndGmvFields(room.completedSalesGmvUsd),
        roomVersion: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      skipped += 1;
      continue;
    }

    emitLiveDiscoveryChanged({ roomId: room.id, status: "ended", reason: "cancelled" });

    const title = room.title.trim() || "Your show";
    await createNotification(prisma, {
      userId: room.sellerId,
      type: "live_host_auto_cancelled",
      title: "Your show was cancelled",
      body: `"${title.slice(0, 80)}" was cancelled because it didn't go live within an hour of its scheduled time. Schedule a new show whenever you're ready.`,
      href: "/account/seller",
    });
    cancelled += 1;
  }

  return { candidates: candidates.length, cancelled, skipped };
}
