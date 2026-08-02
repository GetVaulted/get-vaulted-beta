import { prisma } from "@/lib/prisma";
import { listHiddenPeerIdsForViewer } from "@/lib/user-block";

export type PeopleSearchUser = {
  id: string;
  username: string;
  image: string | null;
  following: boolean;
  followerCount: number;
  isSelf: boolean;
};

const DEFAULT_TAKE = 24;

/**
 * Username people search for follow discovery (not listing-backed).
 * Matches active users by username substring; respects blocks when viewer is signed in.
 */
export async function searchPeopleUsers(
  query: string,
  viewerUserId: string | null,
  opts?: { take?: number },
): Promise<PeopleSearchUser[]> {
  const q = query.trim().toLowerCase().replace(/^@+/, "");
  if (q.length < 1) return [];

  const take = Math.min(40, Math.max(1, opts?.take ?? DEFAULT_TAKE));
  const excludeIds: string[] = [];
  if (viewerUserId) {
    excludeIds.push(viewerUserId);
    const hidden = await listHiddenPeerIdsForViewer(prisma, viewerUserId);
    excludeIds.push(...hidden);
  }

  const rows = await prisma.user.findMany({
    where: {
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      suspendedAt: null,
      accountDeletedAt: null,
      username: { contains: q },
    },
    take,
    orderBy: [{ username: "asc" }],
    select: {
      id: true,
      username: true,
      image: true,
      _count: { select: { sellerFollowsAsSeller: true } },
    },
  });

  if (!rows.length) return [];

  let followingIds = new Set<string>();
  if (viewerUserId) {
    const follows = await prisma.sellerFollow.findMany({
      where: { followerId: viewerUserId, sellerId: { in: rows.map((r) => r.id) } },
      select: { sellerId: true },
    });
    followingIds = new Set(follows.map((f) => f.sellerId));
  }

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    image: r.image,
    following: followingIds.has(r.id),
    followerCount: r._count.sellerFollowsAsSeller,
    isSelf: false,
  }));
}
