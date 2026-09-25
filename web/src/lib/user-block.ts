import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type BlockDb = Prisma.TransactionClient | typeof prisma;

export type UserBlockErrorCode = "CANNOT_BLOCK_ADMIN" | "CANNOT_BLOCK_SELF" | "USER_NOT_FOUND";

export class UserBlockError extends Error {
  readonly code: UserBlockErrorCode;

  constructor(code: UserBlockErrorCode, message: string) {
    super(message);
    this.name = "UserBlockError";
    this.code = code;
  }
}

export function isUserBlockError(e: unknown): e is UserBlockError {
  return e instanceof UserBlockError;
}

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

/** Rejects blocking yourself or a platform admin. */
export async function assertCanBlockUser(
  db: BlockDb,
  args: { blockerId: string; blockedId: string },
): Promise<void> {
  if (!args.blockerId || !args.blockedId || args.blockerId === args.blockedId) {
    throw new UserBlockError("CANNOT_BLOCK_SELF", "You cannot block yourself.");
  }
  const target = await db.user.findUnique({
    where: { id: args.blockedId },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new UserBlockError("USER_NOT_FOUND", "User not found.");
  }
  if (target.role === "admin") {
    throw new UserBlockError("CANNOT_BLOCK_ADMIN", "Admins cannot be blocked.");
  }
}

/**
 * Whether `viewerId` may see `subjectId`'s profile, listings, live shows, and search hits.
 * Mutual: a block in either direction hides both sides. Platform admins are always visible
 * and always see everyone.
 */
export async function viewerCanSeeUser(
  db: BlockDb,
  viewerId: string | null | undefined,
  subjectId: string,
): Promise<boolean> {
  if (!subjectId) return false;
  if (!viewerId || viewerId === subjectId) return true;

  const [viewer, subject] = await Promise.all([
    db.user.findUnique({ where: { id: viewerId }, select: { role: true } }),
    db.user.findUnique({ where: { id: subjectId }, select: { role: true } }),
  ]);
  if (viewer?.role === "admin" || subject?.role === "admin") return true;
  return !(await isUserBlocked(db, viewerId, subjectId));
}

/**
 * Peer user ids that should be hidden from this viewer (search, feeds, shops, follows).
 * Empty when the viewer is an admin. Never includes admin peers.
 */
export async function listHiddenPeerIdsForViewer(db: BlockDb, viewerId: string): Promise<string[]> {
  if (!viewerId) return [];

  const viewer = await db.user.findUnique({
    where: { id: viewerId },
    select: { role: true },
  });
  if (viewer?.role === "admin") return [];

  const rows = await db.userBlock.findMany({
    where: {
      OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
    },
    select: {
      blockerId: true,
      blockedId: true,
      blocker: { select: { role: true } },
      blockedUser: { select: { role: true } },
    },
  });

  const ids = new Set<string>();
  for (const row of rows) {
    const peerId = row.blockerId === viewerId ? row.blockedId : row.blockerId;
    const peerRole = row.blockerId === viewerId ? row.blockedUser.role : row.blocker.role;
    if (peerRole === "admin") continue;
    ids.add(peerId);
  }
  return [...ids];
}

/** Users this account has blocked (outgoing only — for settings UI). */
export async function listBlockedUsersForAccount(
  db: BlockDb,
  blockerId: string,
): Promise<Array<{ userId: string; username: string | null; image: string | null; blockedAt: string }>> {
  const rows = await db.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      createdAt: true,
      blockedUser: { select: { id: true, username: true, image: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.blockedUser.id,
    username: r.blockedUser.username,
    image: r.blockedUser.image,
    blockedAt: r.createdAt.toISOString(),
  }));
}

/** Sets or clears a durable cross-thread block from `blockerId` toward `blockedId`. */
export async function setUserBlocked(
  db: BlockDb,
  args: { blockerId: string; blockedId: string; blocked: boolean },
): Promise<void> {
  if (!args.blockerId || !args.blockedId || args.blockerId === args.blockedId) return;

  if (args.blocked) {
    await assertCanBlockUser(db, { blockerId: args.blockerId, blockedId: args.blockedId });
    await db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: args.blockerId, blockedId: args.blockedId } },
      create: { blockerId: args.blockerId, blockedId: args.blockedId },
      update: {},
    });
    // Mutual invisibility: drop follow edges both ways so neither appears in follow lists.
    await db.sellerFollow.deleteMany({
      where: {
        OR: [
          { followerId: args.blockerId, sellerId: args.blockedId },
          { followerId: args.blockedId, sellerId: args.blockerId },
        ],
      },
    });
  } else {
    await db.userBlock.deleteMany({
      where: { blockerId: args.blockerId, blockedId: args.blockedId },
    });
  }
}
