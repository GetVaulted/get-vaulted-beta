import type { PrismaClient } from "@/generated/prisma/client";
import { deletedCutoff } from "@/lib/message-thread-deletion";

export type MessageCleanupResult = {
  /** Deleted conversations that passed the retention window and were removed for good (per person). */
  autoPurged: number;
  /** Conversations physically removed because BOTH people had deleted them for good. */
  threadsRemoved: number;
};

const REMOVE_BATCH = 500;

/**
 * Daily sweep behind the Messages "Deleted" area.
 *
 * 1. Anyone's deleted conversation older than the retention window (14 days) is removed for good
 *    for that person — unless a newer message arrived since (then it is back in their inbox).
 * 2. Once BOTH people have deleted a conversation for good (and nothing newer exists), the
 *    conversation and its messages are physically removed to free space. Threads tied to an order
 *    or an offer are always kept: they are part of the transaction record.
 *
 * Deleting is per person, so one person's delete never removes the other person's copy.
 */
export async function purgeExpiredDeletedThreads(
  db: Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "messageThread">,
  now: Date = new Date(),
): Promise<MessageCleanupResult> {
  const cutoff = deletedCutoff(now);

  const autoPurged = await db.$executeRaw`
    UPDATE "MessageThreadParticipant" p
    SET "purgedAt" = ${now}, "updatedAt" = ${now}
    WHERE p."deletedAt" IS NOT NULL
      AND p."deletedAt" < ${cutoff}
      AND p."purgedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."threadId" = p."threadId" AND m."createdAt" > p."deletedAt"
      )
  `;

  const removable = await db.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "MessageThread" t
    JOIN "MessageThreadParticipant" pb
      ON pb."threadId" = t."id" AND pb."userId" = t."buyerId" AND pb."purgedAt" IS NOT NULL
    JOIN "MessageThreadParticipant" ps
      ON ps."threadId" = t."id" AND ps."userId" = t."sellerId" AND ps."purgedAt" IS NOT NULL
    WHERE t."orderId" IS NULL AND t."offerId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."threadId" = t."id" AND m."createdAt" > LEAST(pb."purgedAt", ps."purgedAt")
      )
    LIMIT ${REMOVE_BATCH}
  `;

  let threadsRemoved = 0;
  if (removable.length > 0) {
    const res = await db.messageThread.deleteMany({ where: { id: { in: removable.map((r) => r.id) } } });
    threadsRemoved = res.count;
  }

  return { autoPurged: Number(autoPurged), threadsRemoved };
}
