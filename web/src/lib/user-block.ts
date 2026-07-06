import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type BlockDb = Prisma.TransactionClient | typeof prisma;

/**
 * True if either user has blocked the other.
 *
 * Checks the durable, cross-thread `UserBlock` table first (the source of truth —
 * covers a blocked user starting a brand new thread via a different listing/live-room/
 * profile anchor). Falls back to scanning legacy per-thread `MessageThreadParticipant.blocked`
 * flags on any existing thread between the pair, so blocks made before `UserBlock` existed
 * (or any edge case where the new table wasn't written) are still honored.
 */
export async function isUserBlocked(db: BlockDb, userIdA: string, userIdB: string): Promise<boolean> {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;

  const directBlock = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  if (directBlock) return true;

  const legacyThreadBlock = await db.messageThreadParticipant.findFirst({
    where: {
      blocked: true,
      userId: { in: [userIdA, userIdB] },
      thread: {
        OR: [
          { buyerId: userIdA, sellerId: userIdB },
          { buyerId: userIdB, sellerId: userIdA },
        ],
      },
    },
    select: { id: true },
  });
  return Boolean(legacyThreadBlock);
}

/** Sets or clears a durable cross-thread block from `blockerId` toward `blockedId`. */
export async function setUserBlocked(
  db: BlockDb,
  args: { blockerId: string; blockedId: string; blocked: boolean },
): Promise<void> {
  if (!args.blockerId || !args.blockedId || args.blockerId === args.blockedId) return;

  if (args.blocked) {
    await db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: args.blockerId, blockedId: args.blockedId } },
      create: { blockerId: args.blockerId, blockedId: args.blockedId },
      update: {},
    });
  } else {
    await db.userBlock.deleteMany({
      where: { blockerId: args.blockerId, blockedId: args.blockedId },
    });
  }
}
