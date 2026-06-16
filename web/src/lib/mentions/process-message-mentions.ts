import type { MessageMentionSourceType } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createNotification } from "@/lib/notifications";
import type { MessageMentionDTO } from "@/lib/mentions/mention-types";
import { parseMentionUsernames } from "@/lib/mentions/parse-mentions";
import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";

type ProcessArgs = {
  db: TransactionClient;
  sourceType: MessageMentionSourceType;
  sourceId: string;
  body: string;
  senderId: string;
  senderUsername: string;
  threadId?: string;
  liveRoomId?: string;
  notifyHref: string;
  notifyContext: string;
};

async function canNotifyMention(args: {
  db: TransactionClient;
  senderId: string;
  mentionedUserId: string;
  threadId?: string;
  liveRoomId?: string;
}): Promise<boolean> {
  if (args.senderId === args.mentionedUserId) return false;

  const user = await args.db.user.findUnique({
    where: { id: args.mentionedUserId },
    select: { suspendedAt: true, accountDeletedAt: true },
  });
  if (!user || user.suspendedAt || user.accountDeletedAt) return false;

  if (args.threadId) {
    const participant = await args.db.messageThreadParticipant.findUnique({
      where: { threadId_userId: { threadId: args.threadId, userId: args.mentionedUserId } },
      select: { blocked: true },
    });
    if (participant?.blocked) return false;
  }

  if (args.liveRoomId) {
    const restrictions = await getLiveRoomUserRestrictions({
      liveRoomId: args.liveRoomId,
      userId: args.mentionedUserId,
    });
    if (restrictions.roomBanned) return false;
  }

  return true;
}

export async function processMessageMentions(args: ProcessArgs): Promise<MessageMentionDTO[]> {
  const usernames = parseMentionUsernames(args.body);
  if (usernames.length === 0) return [];

  const users = await args.db.user.findMany({
    where: {
      username: { in: usernames },
      suspendedAt: null,
      accountDeletedAt: null,
    },
    select: { id: true, username: true },
  });

  const byUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));
  const uniqueById = new Map<string, { id: string; username: string }>();
  for (const name of usernames) {
    const user = byUsername.get(name);
    if (user) uniqueById.set(user.id, user);
  }

  const saved: MessageMentionDTO[] = [];
  const preview = args.body.length > 80 ? `${args.body.slice(0, 77)}…` : args.body;

  for (const user of uniqueById.values()) {
    try {
      await args.db.messageMention.create({
        data: {
          sourceType: args.sourceType,
          sourceId: args.sourceId,
          mentionedUserId: user.id,
          mentionedByUserId: args.senderId,
          usernameSnapshot: user.username,
        },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2002") throw e;
      continue;
    }

    saved.push({ userId: user.id, username: user.username });

    const shouldNotify = await canNotifyMention({
      db: args.db,
      senderId: args.senderId,
      mentionedUserId: user.id,
      threadId: args.threadId,
      liveRoomId: args.liveRoomId,
    });
    if (!shouldNotify) continue;

    await createNotification(args.db, {
      userId: user.id,
      type: "chat_mention",
      title: `@${args.senderUsername} mentioned you`,
      body: `${args.notifyContext}: ${preview}`,
      href: args.notifyHref,
    });
  }

  return saved;
}
