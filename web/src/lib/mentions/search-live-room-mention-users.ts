import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";
import { searchMentionUsers } from "@/lib/mentions/search-mention-users";

async function listRecentRoomChattersForMention(
  liveRoomId: string,
  viewerUserId: string,
  take: number,
  db: Pick<PrismaClient, "liveRoomMessage">,
): Promise<MentionSearchUser[]> {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await db.liveRoomMessage.findMany({
    where: {
      liveRoomId,
      deletedAt: null,
      createdAt: { gte: since },
      senderId: { not: viewerUserId },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      senderId: true,
      createdAt: true,
      sender: { select: { id: true, username: true, image: true, suspendedAt: true, accountDeletedAt: true } },
    },
  });

  const map = new Map<string, MentionSearchUser & { lastSeenAt: string }>();
  for (const row of rows) {
    const sender = row.sender;
    if (!sender?.id || sender.suspendedAt || sender.accountDeletedAt) continue;
    const existing = map.get(sender.id);
    if (existing) {
      if (row.createdAt.toISOString() > existing.lastSeenAt) {
        existing.lastSeenAt = row.createdAt.toISOString();
      }
      continue;
    }
    map.set(sender.id, {
      id: sender.id,
      username: sender.username,
      image: sender.image,
      lastSeenAt: row.createdAt.toISOString(),
    });
    if (map.size >= take) break;
  }

  return [...map.values()]
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .map(({ id, username, image }) => ({ id, username, image }));
}

/** Recent room chatters when `query` is empty; filters + global search when typing. */
export async function searchLiveRoomMentionUsers(
  liveRoomId: string,
  query: string,
  viewerUserId: string,
  db: Pick<PrismaClient, "liveRoomMessage" | "user"> = prisma,
): Promise<MentionSearchUser[]> {
  const q = query.trim().toLowerCase();
  const recent = await listRecentRoomChattersForMention(liveRoomId, viewerUserId, 24, db);

  if (!q) {
    return recent.slice(0, 12);
  }

  const filtered = recent.filter((u) => u.username.toLowerCase().includes(q));
  if (filtered.length >= 8) return filtered.slice(0, 12);

  const seen = new Set(filtered.map((u) => u.id));
  const global = await searchMentionUsers(q, viewerUserId, db);
  for (const user of global) {
    if (seen.has(user.id)) continue;
    filtered.push(user);
    seen.add(user.id);
    if (filtered.length >= 12) break;
  }
  return filtered;
}
