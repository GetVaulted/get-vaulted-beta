import type { MessageMentionSourceType } from "@/generated/prisma/client";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { createNotification } from "@/lib/notifications";
import type { MessageMentionDTO } from "@/lib/mentions/mention-types";
import { parseMentionUsernames } from "@/lib/mentions/parse-mentions";
import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";
import { prisma } from "@/lib/prisma";

type MentionDb = TransactionClient | typeof prisma;

type ProcessArgs = {
  db: MentionDb;
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
  db: MentionDb;
  senderId: string;
  mentionedUserId: string;
  threadId?: string;
  liveRoomId?: string;
}): Promise<boolean> {
  try {
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
  } catch (e) {
    console.error("canNotifyMention failed", e);
    return false;
  }
}

/** Best-effort @mention persistence + notifications. Never throws — chat send must not fail. */
export async function processMessageMentions(args: ProcessArgs): Promise<MessageMentionDTO[]> {
  try {
    const usernames = parseMentionUsernames(args.body);
    if (usernames.length === 0) return [];

    const users = await args.db.user.findMany({
      where: {
        suspendedAt: null,
        accountDeletedAt: null,
        OR: usernames.map((username) => ({
          username: { equals: username, mode: "insensitive" },
        })),
      },
      select: { id: true, username: true },
    });

    const byUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));
    const uniqueById = new Map<string, { id: string; username: string }>();
    for (const name of usernames) {
      const user = byUsername.get(name);
      if (user) uniqueById.set(user.id, user);
    }

    let liveRoomTitle: string | null = null;
    if (args.liveRoomId) {
      const room = await args.db.liveRoom.findUnique({
        where: { id: args.liveRoomId },
        select: { title: true },
      });
      liveRoomTitle = room?.title?.trim() || null;
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
        if (code === "P2002") continue;
        console.error("messageMention.create failed", {
          sourceType: args.sourceType,
          sourceId: args.sourceId,
          mentionedUserId: user.id,
          code,
          error: e,
        });
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

      const mentionTitle =
        args.sourceType === "live_room_message"
          ? `@${args.senderUsername} tagged you in live chat`
          : `@${args.senderUsername} mentioned you`;
      const mentionBody = liveRoomTitle
        ? `${liveRoomTitle}: ${preview}`
        : `${args.notifyContext}: ${preview}`;

      await createNotification(args.db, {
        userId: user.id,
        type: "chat_mention",
        title: mentionTitle,
        body: mentionBody,
        href: args.notifyHref,
      });
    }

    return saved;
  } catch (e) {
    console.error("processMessageMentions failed", {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      error: e,
    });
    return [];
  }
}
