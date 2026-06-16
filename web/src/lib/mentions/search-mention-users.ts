import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";

export async function searchMentionUsers(
  query: string,
  viewerUserId: string,
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<MentionSearchUser[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  return db.user.findMany({
    where: {
      id: { not: viewerUserId },
      suspendedAt: null,
      accountDeletedAt: null,
      username: { contains: q },
    },
    take: 8,
    orderBy: [{ username: "asc" }],
    select: { id: true, username: true, image: true },
  });
}
