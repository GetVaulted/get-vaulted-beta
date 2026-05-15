import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
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
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 2000),
        href: input.href.slice(0, 2000),
      },
    });
    emitUserNotificationCreated(input.userId);
  } catch (e) {
    console.error("createNotification failed", e);
  }
}
