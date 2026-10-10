import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin/admin-audit";

export class ModerationError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "ModerationError";
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ReviewState = "visible" | "hidden" | "all";

/** Seller reviews for moderation. Hidden reviews stay in the database; they just stop showing publicly. */
export async function listAdminReviews(opts: { q?: string; state?: ReviewState; maxRating?: number; limit?: number }) {
  const q = (opts.q ?? "").trim().replace(/^@/, "");
  const contains = { contains: q, mode: "insensitive" as const };
  const rows = await prisma.sellerReview.findMany({
    where: {
      ...(opts.state === "hidden" ? { hiddenAt: { not: null } } : opts.state === "visible" ? { hiddenAt: null } : {}),
      ...(opts.maxRating ? { rating: { lte: opts.maxRating } } : {}),
      ...(q
        ? { OR: [{ body: contains }, { seller: { username: contains } }, { buyer: { username: contains } }, { orderId: q }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 100, 200),
    select: {
      id: true,
      orderId: true,
      rating: true,
      body: true,
      tags: true,
      hiddenAt: true,
      createdAt: true,
      seller: { select: { id: true, username: true } },
      buyer: { select: { id: true, username: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    rating: r.rating,
    body: r.body,
    tags: r.tags,
    hidden: !!r.hiddenAt,
    hiddenAt: r.hiddenAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    seller: r.seller,
    buyer: r.buyer,
  }));
}

export async function setReviewHidden(args: { adminUserId: string; reviewId: string; hidden: boolean; reason: string }) {
  return prisma.$transaction(async (tx: Tx) => {
    const r = await tx.sellerReview.findUnique({
      where: { id: args.reviewId },
      select: { id: true, sellerId: true, buyerId: true, hiddenAt: true, rating: true },
    });
    if (!r) throw new ModerationError("NOT_FOUND", 404);
    if (args.hidden && r.hiddenAt) throw new ModerationError("ALREADY_HIDDEN", 409);
    if (!args.hidden && !r.hiddenAt) throw new ModerationError("NOT_HIDDEN", 409);
    await tx.sellerReview.update({ where: { id: r.id }, data: { hiddenAt: args.hidden ? new Date() : null } });
    await logAdminAction(
      {
        adminUserId: args.adminUserId,
        action: args.hidden ? "review.hide" : "review.restore",
        targetType: "review",
        targetId: r.id,
        targetUserId: r.sellerId,
        reason: args.reason,
        detail: { buyerId: r.buyerId, rating: r.rating },
      },
      tx as never,
    );
    return { id: r.id, hidden: args.hidden };
  });
}

/** Live chat messages for moderation: by show, by sender, or by text. Deleted messages stay stored. */
export async function listAdminChatMessages(opts: { showId?: string; username?: string; q?: string; limit?: number }) {
  const username = (opts.username ?? "").trim().replace(/^@/, "");
  const q = (opts.q ?? "").trim();
  if (!opts.showId && !username && q.length < 2) return [];
  const rows = await prisma.liveRoomMessage.findMany({
    where: {
      ...(opts.showId ? { liveRoomId: opts.showId } : {}),
      ...(username ? { sender: { username: { equals: username, mode: "insensitive" as const } } } : {}),
      ...(q.length >= 2 ? { body: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 100, 200),
    select: {
      id: true,
      body: true,
      messageType: true,
      deletedAt: true,
      createdAt: true,
      sender: { select: { id: true, username: true } },
      liveRoom: { select: { id: true, title: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    type: String(m.messageType),
    deleted: !!m.deletedAt,
    createdAt: m.createdAt.toISOString(),
    sender: m.sender,
    show: m.liveRoom,
  }));
}

export async function setChatMessageDeleted(args: { adminUserId: string; messageId: string; deleted: boolean; reason: string }) {
  return prisma.$transaction(async (tx: Tx) => {
    const m = await tx.liveRoomMessage.findUnique({
      where: { id: args.messageId },
      select: { id: true, senderId: true, liveRoomId: true, deletedAt: true },
    });
    if (!m) throw new ModerationError("NOT_FOUND", 404);
    if (args.deleted && m.deletedAt) throw new ModerationError("ALREADY_DELETED", 409);
    if (!args.deleted && !m.deletedAt) throw new ModerationError("NOT_DELETED", 409);
    await tx.liveRoomMessage.update({
      where: { id: m.id },
      data: args.deleted ? { deletedAt: new Date(), deletedByUserId: args.adminUserId } : { deletedAt: null, deletedByUserId: null },
    });
    await logAdminAction(
      {
        adminUserId: args.adminUserId,
        action: args.deleted ? "chat.delete" : "chat.restore",
        targetType: "chat_message",
        targetId: m.id,
        targetUserId: m.senderId,
        reason: args.reason,
        detail: { liveRoomId: m.liveRoomId },
      },
      tx as never,
    );
    return { id: m.id, deleted: args.deleted };
  });
}
