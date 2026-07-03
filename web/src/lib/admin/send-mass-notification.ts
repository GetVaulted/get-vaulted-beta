import { prisma } from "@/lib/prisma";
import { emitUserNotificationCreated } from "@/lib/realtime-emit-server";
import { sendExpoPushBroadcast } from "@/lib/push/send-expo-push";
import {
  NOTIFICATION_BROADCAST_TYPE,
  MASS_NOTIFICATION_TITLE_MAX,
  MASS_NOTIFICATION_BODY_MAX,
  validateMassNotificationInput,
  type MassNotificationInput,
} from "@/lib/admin/mass-notification";

const NOTIFICATION_ROW_BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SendMassNotificationResult = {
  broadcastId: string;
  recipientCount: number;
  pushSentCount: number;
};

/**
 * Fan a title/body/link out to every active (non-suspended) user as an inbox notification + push,
 * and log the send in `NotificationBroadcast` for the admin history view.
 */
export async function sendMassNotification(
  input: MassNotificationInput & { createdByUserId: string },
): Promise<SendMassNotificationResult> {
  const fieldError = validateMassNotificationInput(input);
  if (fieldError) throw new Error(fieldError.message);

  const title = input.title.trim().slice(0, MASS_NOTIFICATION_TITLE_MAX);
  const body = input.body.trim().slice(0, MASS_NOTIFICATION_BODY_MAX);
  const href = input.href?.trim() || "/";

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

  const broadcast = await prisma.notificationBroadcast.create({
    data: {
      title,
      body,
      href,
      audience: "all",
      recipientCount: userIds.length,
      pushSentCount,
      createdByUserId: input.createdByUserId,
    },
  });

  return { broadcastId: broadcast.id, recipientCount: userIds.length, pushSentCount };
}
