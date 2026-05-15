import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = session.user.id;

  const threads = await prisma.messageThread.findMany({
    where: { OR: [{ buyerId: uid }, { sellerId: uid }] },
    orderBy: { updatedAt: "desc" },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, username: true } },
      seller: { select: { id: true, username: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
  });

  const ids = threads.map((t) => t.id);
  const unreadGroups =
    ids.length === 0
      ? []
      : await prisma.message.groupBy({
          by: ["threadId"],
          where: {
            threadId: { in: ids },
            recipientId: uid,
            readAt: null,
          },
          _count: { _all: true },
        });
  const unreadMap = new Map(unreadGroups.map((g) => [g.threadId, g._count._all]));

  return NextResponse.json({
    threads: threads.map((t) => {
      const other = t.buyerId === uid ? t.seller : t.buyer;
      const last = t.messages[0];
      return {
        id: t.id,
        listingId: t.listingId,
        listingTitle: t.listing.title,
        otherUserId: other.id,
        otherUsername: other.username,
        lastPreview: last?.body ?? "",
        lastAt: last ? last.createdAt.toISOString() : t.updatedAt.toISOString(),
        unreadCount: unreadMap.get(t.id) ?? 0,
      };
    }),
  });
}
