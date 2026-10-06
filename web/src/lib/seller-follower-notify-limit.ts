import type { PrismaClient } from "@/generated/prisma/client";

/**
 * A seller may notify their whole follower list at most ONCE per hour, across every way that can
 * do it (the share sheet's "Notify followers" and the automatic "is live now" alert). It is per
 * seller, not per show, so switching shows or tapping twice cannot get around it.
 */
export const FOLLOWER_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;

type Db = Pick<PrismaClient, "user">;

export type FollowerNotifySlot =
  | { ok: true; claimedAt: Date; previous: Date | null }
  | { ok: false; retryAfterMinutes: number };

function minutesUntil(last: Date, now: Date): number {
  const waitMs = last.getTime() + FOLLOWER_NOTIFY_INTERVAL_MS - now.getTime();
  return Math.min(60, Math.max(1, Math.ceil(waitMs / 60000)));
}

/**
 * Claim this seller's hourly follower-notification slot. Atomic: the write only succeeds if the
 * stored time is still what we read, so two simultaneous requests cannot both get through.
 */
export async function claimFollowerNotifySlot(
  db: Db,
  sellerId: string,
  now: Date = new Date(),
): Promise<FollowerNotifySlot> {
  const row = await db.user.findUnique({ where: { id: sellerId }, select: { followerNotifiedAt: true } });
  const previous = row?.followerNotifiedAt ?? null;
  if (previous && now.getTime() - previous.getTime() < FOLLOWER_NOTIFY_INTERVAL_MS) {
    return { ok: false, retryAfterMinutes: minutesUntil(previous, now) };
  }
  const res = await db.user.updateMany({
    where: { id: sellerId, followerNotifiedAt: previous },
    data: { followerNotifiedAt: now },
  });
  if (res.count !== 1) {
    // Someone else claimed it between our read and write.
    return { ok: false, retryAfterMinutes: 60 };
  }
  return { ok: true, claimedAt: now, previous };
}

/** Give the slot back when nothing was actually sent (the send failed), so the seller can retry. */
export async function releaseFollowerNotifySlot(
  db: Db,
  sellerId: string,
  slot: Extract<FollowerNotifySlot, { ok: true }>,
): Promise<void> {
  await db.user
    .updateMany({
      where: { id: sellerId, followerNotifiedAt: slot.claimedAt },
      data: { followerNotifiedAt: slot.previous },
    })
    .catch(() => undefined);
}
