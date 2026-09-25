import { prisma } from "@/lib/prisma";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";
import { listHiddenPeerIdsForViewer } from "@/lib/user-block";

export async function searchMentionUsers(
  query: string,
  viewerUserId: string,
): Promise<MentionSearchUser[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const hiddenIds = await listHiddenPeerIdsForViewer(prisma, viewerUserId);
  const excludeIds = [viewerUserId, ...hiddenIds];

  return prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
      suspendedAt: null,
      accountDeletedAt: null,
      username: { contains: q },
    },
    take: 8,
    orderBy: [{ username: "asc" }],
    select: { id: true, username: true, image: true },
  });
}
