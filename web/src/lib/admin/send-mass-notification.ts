import { prisma } from "@/lib/prisma";
import { emitUserNotificationCreated } from "@/lib/realtime-emit-server";
import { sendExpoPushBroadcast } from "@/lib/push/send-expo-push";
import {
  NOTIFICATION_BROADCAST_TYPE,
  MASS_NOTIFICATION_TITLE_MAX,
  MASS_NOTIFICATION_BODY_MAX,
  MASS_NOTIFICATION_IDEMPOTENCY_KEY_MAX,
  validateMassNotificationInput,
  type MassNotificationInput,
} from "@/lib/admin/mass-notification";

const NOTIFICATION_ROW_BATCH_SIZE = 500;

/**
 * How long a reserved-but-not-yet-completed broadcast row is given the benefit of the doubt as
 * "still actively sending" before a retry with the same idempotency key is allowed to re-attempt
 * the fan-out. Guards against a double-click / near-simultaneous retry racing the original
 * in-flight send (which would otherwise fan out to every user twice), while still letting a
 * *genuinely* crashed attempt (process died mid-send) recover well within an admin's patience.
 */
const RESERVATION_STALE_MS = 5 * 60 * 1000;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isUniqueConstraintError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2002");
}

export type SendMassNotificationResult = {
  broadcastId: string;
  recipientCount: number;
  pushSentCount: number;
  /** True when this call reused an existing broadcast (same idempotency key) instead of sending again. */
  replayed?: boolean;
};

/**
 * Fan a title/body/link out to every active (non-suspended) user as an inbox notification + push,
 * and log the send in `NotificationBroadcast` for the admin history view.
 *
 * Idempotency: when `idempotencyKey` is provided, a placeholder `NotificationBroadcast` row is
 * reserved for that key *before* any notifications/pushes go out, relying on the column's unique
 * DB constraint. A double-click or retried POST with the same key hits that constraint; what
 * happens next depends on whether the original attempt actually finished (`completedAt` set):
 *  - Completed: safely replay the already-computed result instead of fanning out duplicates.
 *  - Not completed, reserved very recently: assume it's still actively sending and reject the
 *    retry outright, rather than risk a second concurrent fan-out.
 *  - Not completed, reserved a while ago (`RESERVATION_STALE_MS`): the original attempt almost
 *    certainly crashed before finishing — reuse the same row and actually re-attempt the fan-out,
 *    instead of forever masquerading a failed send as a successful replay.
 */
export async function sendMassNotification(
  input: MassNotificationInput & { createdByUserId: string },
): Promise<SendMassNotificationResult> {
  const fieldError = validateMassNotificationInput(input);
  if (fieldError) throw new Error(fieldError.message);

  const title = input.title.trim().slice(0, MASS_NOTIFICATION_TITLE_MAX);
  const body = input.body.trim().slice(0, MASS_NOTIFICATION_BODY_MAX);
  const href = input.href?.trim() || "/";
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, MASS_NOTIFICATION_IDEMPOTENCY_KEY_MAX) || null;

  let reservedBroadcastId: string | null = null;
  if (idempotencyKey) {
    try {
      const reserved = await prisma.notificationBroadcast.create({
        data: {
          title,
          body,
          href,
          audience: "all",
          recipientCount: 0,
          pushSentCount: 0,
          createdByUserId: input.createdByUserId,
          idempotencyKey,
        },
        select: { id: true },
      });
      reservedBroadcastId = reserved.id;
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        const existing = await prisma.notificationBroadcast.findUnique({ where: { idempotencyKey } });
        if (existing) {
          if (existing.completedAt) {
            return {
              broadcastId: existing.id,
              recipientCount: existing.recipientCount,
              pushSentCount: existing.pushSentCount,
              replayed: true,
            };
          }
          const ageMs = Date.now() - existing.createdAt.getTime();
          if (ageMs < RESERVATION_STALE_MS) {
            throw new Error(
              "A broadcast with this idempotency key is already being sent. Please wait a moment and try again.",
            );
          }
          // The original attempt reserved this row well over `RESERVATION_STALE_MS` ago and never
          // marked it complete — it crashed/errored mid-send. Reuse the same row (same
          // idempotency key) and fall through to actually re-attempt the fan-out below, instead of
          // treating this permanently-partial row as a done deal.
          reservedBroadcastId = existing.id;
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
  }

  const users = await prisma.user.findMany({
    where: { suspendedAt: null },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  for (const batch of chunkArray(userIds, NOTIFICATION_ROW_BATCH_SIZE)) {
    await prisma.notification.createMany({
      data: batch.map((userId) => ({ userId, type: NOTIFICATION_BROADCAST_TYPE, title, body, href })),
    });
    for (const userId of batch) emitUserNotificationCreated(userId);
  }

  const pushSentCount = await sendExpoPushBroadcast({
    userIds,
    title,
    body,
    href,
    type: NOTIFICATION_BROADCAST_TYPE,
  });

  const completedAt = new Date();
  const broadcast = reservedBroadcastId
    ? await prisma.notificationBroadcast.update({
        where: { id: reservedBroadcastId },
        data: { recipientCount: userIds.length, pushSentCount, completedAt },
      })
    : await prisma.notificationBroadcast.create({
        data: {
          title,
          body,
          href,
          audience: "all",
          recipientCount: userIds.length,
          pushSentCount,
          createdByUserId: input.createdByUserId,
          completedAt,
        },
      });

  return { broadcastId: broadcast.id, recipientCount: userIds.length, pushSentCount };
}
