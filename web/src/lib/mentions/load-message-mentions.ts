import type { MessageMentionSourceType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { MessageMentionDTO } from "@/lib/mentions/mention-types";

export async function loadMentionsForSources(
  sourceType: MessageMentionSourceType,
  sourceIds: string[],
): Promise<Map<string, MessageMentionDTO[]>> {
  const map = new Map<string, MessageMentionDTO[]>();
  if (sourceIds.length === 0) return map;

  const rows = await prisma.messageMention.findMany({
    where: { sourceType, sourceId: { in: sourceIds } },
    select: { sourceId: true, mentionedUserId: true, usernameSnapshot: true },
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    const list = map.get(row.sourceId) ?? [];
    list.push({ userId: row.mentionedUserId, username: row.usernameSnapshot });
    map.set(row.sourceId, list);
  }
  return map;
}

export async function loadMentionsForSource(
  sourceType: MessageMentionSourceType,
  sourceId: string,
): Promise<MessageMentionDTO[]> {
  const map = await loadMentionsForSources(sourceType, [sourceId]);
  return map.get(sourceId) ?? [];
}
