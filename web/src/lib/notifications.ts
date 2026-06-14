import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { scheduleExpoPushForUser } from "@/lib/push/send-expo-push";
import { emitUserNotificationCreated } from "@/lib/realtime-emit-server";

export type NotificationDb = TransactionClient | typeof prisma;

export async function createNotification(
  db: NotificationDb,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    href: string;
  },
): Promise<string | null> {
  try {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 2000),
        href: input.href.slice(0, 2000),
      },
    });
    emitUserNotificationCreated(input.userId);
    scheduleExpoPushForUser(
      {
        userId: input.userId,
        title: input.title,
        body: input.body,
        href: input.href,
        type: input.type,
        notificationId: row.id,
      },
      { deferMs: db === prisma ? 0 : 750 },
    );
    return row.id;
  } catch (e) {
    console.error("createNotification failed", e);
    return null;
  }
}
