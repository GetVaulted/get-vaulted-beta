import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const MAX_DIRECT_RECIPIENTS = 25;
const MAX_FOLLOWER_BLAST = 200;

export type ShareLiveRoomInAppInput = {
  senderId: string;
  liveRoomId: string;
  recipientUserIds?: string[];
  notifyFollowers?: boolean;
  note?: string;
};

export type ShareLiveRoomInAppResult = {
  sent: number;
  skipped: number;
};

function trimNote(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  return raw.trim().slice(0, 280);
}

function uniqueIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function shareLiveRoomInApp(input: ShareLiveRoomInAppInput): Promise<ShareLiveRoomInAppResult> {
  const senderId = input.senderId.trim();
  const liveRoomId = input.liveRoomId.trim();
  const note = trimNote(input.note);
  const directIds = uniqueIds(input.recipientUserIds).filter((id) => id !== senderId).slice(0, MAX_DIRECT_RECIPIENTS);

  const [room, sender] = await Promise.all([
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { id: true, title: true, sellerId: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: { username: true },
    }),
  ]);

  if (!room) throw new Error("NOT_FOUND");

  const senderLabel = sender?.username?.trim() ? `@${sender.username.trim()}` : "Someone";
  const showTitle = room.title?.trim() || "Live show";
  const href = `/live/${encodeURIComponent(room.id)}`;
  const live = room.status === "live";
  const actionLine = live ? "Join the live show" : "Join when we go live";
  const bodyBase = note
    ? `${showTitle} — ${actionLine}. "${note}"`
    : `${showTitle} — ${actionLine}.`;

  let recipientIds: string[] = [...directIds];

  if (input.notifyFollowers) {
    if (room.sellerId !== senderId) {
      throw new Error("NOT_HOST");
    }
    const followerRows = await prisma.sellerFollow.findMany({
      where: { sellerId: senderId },
      select: { followerId: true },
      take: MAX_FOLLOWER_BLAST,
      orderBy: { createdAt: "desc" },
    });
    const followerIds = followerRows.map((row) => row.followerId).filter((id) => id !== senderId);
    recipientIds = uniqueIds([...recipientIds, ...followerIds]);
  }

  if (recipientIds.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  if (directIds.length > 0) {
    const allowed = await prisma.sellerFollow.findMany({
      where: {
        followerId: senderId,
        sellerId: { in: directIds },
      },
      select: { sellerId: true },
    });
    const allowedSet = new Set(allowed.map((row) => row.sellerId));
    recipientIds = recipientIds.filter((id) => {
      if (!directIds.includes(id)) return true;
      return allowedSet.has(id);
    });
  }

  let sent = 0;
  let skipped = 0;

  for (const userId of recipientIds) {
    if (userId === senderId) {
      skipped += 1;
      continue;
    }
    const title = `${senderLabel} shared a live show with you`;
    const id = await createNotification(prisma, {
      userId,
      type: "live_room_share",
      title,
      body: bodyBase,
      href,
    });
    if (id) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
}
