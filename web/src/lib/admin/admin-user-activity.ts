import { prisma } from "@/lib/prisma";

export type AdminUserActivityKind =
  | "live_join"
  | "live_chat"
  | "live_bid"
  | "live_tip"
  | "live_giveaway"
  | "live_hosted"
  | "order_bought"
  | "order_sold"
  | "listing_created"
  | "report_filed"
  | "account_created";

export type AdminUserActivityItem = {
  id: string;
  kind: AdminUserActivityKind;
  label: string;
  detail: string | null;
  at: string;
  href: string | null;
};

const DEFAULT_LIMIT = 60;
const DEFAULT_LOOKBACK_DAYS = 90;

function iso(d: Date): string {
  return d.toISOString();
}

/**
 * First-party product activity for admin review (chat/bids/orders/etc).
 * Silent lurkers may not appear — presence is not persisted.
 */
export async function listAdminUserActivity(
  userId: string,
  opts?: { limit?: number; lookbackDays?: number },
): Promise<{ userId: string; items: AdminUserActivityItem[]; lookbackDays: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), 150);
  const lookbackDays = Math.min(Math.max(opts?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 1), 365);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const perSource = Math.min(40, limit);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, createdAt: true },
  });
  if (!user) {
    return { userId, items: [], lookbackDays };
  }

  const [messages, bids, tips, giveaways, hosted, bought, sold, listings, reports] = await Promise.all([
    prisma.liveRoomMessage.findMany({
      where: { senderId: userId, createdAt: { gte: since }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        body: true,
        messageType: true,
        createdAt: true,
        liveRoomId: true,
        liveRoom: { select: { title: true } },
      },
    }),
    prisma.liveRoomBid.findMany({
      where: { bidderId: userId, acceptedAt: { gte: since } },
      orderBy: { acceptedAt: "desc" },
      take: perSource,
      select: {
        id: true,
        amountUsd: true,
        acceptedAt: true,
        liveRoomId: true,
        liveRoom: { select: { title: true } },
      },
    }),
    prisma.liveTip.findMany({
      where: { senderId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        amountUsd: true,
        createdAt: true,
        liveRoomId: true,
        liveRoom: { select: { title: true } },
      },
    }),
    prisma.liveGiveawayEntry.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        createdAt: true,
        giveaway: {
          select: {
            liveRoomId: true,
            title: true,
            liveRoom: { select: { title: true } },
          },
        },
      },
    }),
    prisma.liveRoom.findMany({
      where: {
        sellerId: userId,
        OR: [{ startedAt: { gte: since } }, { streamStartedAt: { gte: since } }, { createdAt: { gte: since } }],
      },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, title: true, status: true, startedAt: true, streamStartedAt: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { buyerId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, totalUsd: true, status: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { sellerId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, totalUsd: true, status: true, createdAt: true },
    }),
    prisma.listing.findMany({
      where: { sellerId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.report.findMany({
      where: { reporterUserId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: Math.min(20, perSource),
      select: { id: true, targetType: true, reason: true, description: true, createdAt: true },
    }),
  ]);

  const items: AdminUserActivityItem[] = [];

  for (const m of messages) {
    const isSystem = m.messageType === "system";
    const joinLike = isSystem && /joined/i.test(m.body);
    items.push({
      id: `msg_${m.id}`,
      kind: joinLike ? "live_join" : "live_chat",
      label: joinLike ? "Joined live show" : isSystem ? "Live system event" : "Live chat",
      detail: `${m.liveRoom.title}${m.body ? ` — ${m.body.slice(0, 80)}` : ""}`,
      at: iso(m.createdAt),
      href: `/admin/live-shows/${encodeURIComponent(m.liveRoomId)}`,
    });
  }

  for (const b of bids) {
    items.push({
      id: `bid_${b.id}`,
      kind: "live_bid",
      label: "Live bid",
      detail: `${b.liveRoom.title} — $${b.amountUsd.toFixed(2)}`,
      at: iso(b.acceptedAt),
      href: `/admin/live-shows/${encodeURIComponent(b.liveRoomId)}`,
    });
  }

  for (const t of tips) {
    items.push({
      id: `tip_${t.id}`,
      kind: "live_tip",
      label: "Live tip",
      detail: `${t.liveRoom.title} — $${t.amountUsd.toFixed(2)}`,
      at: iso(t.createdAt),
      href: `/admin/live-shows/${encodeURIComponent(t.liveRoomId)}`,
    });
  }

  for (const g of giveaways) {
    const roomTitle = g.giveaway.liveRoom.title || g.giveaway.title;
    items.push({
      id: `giveaway_${g.id}`,
      kind: "live_giveaway",
      label: "Giveaway entry",
      detail: roomTitle,
      at: iso(g.createdAt),
      href: `/admin/live-shows/${encodeURIComponent(g.giveaway.liveRoomId)}`,
    });
  }

  for (const room of hosted) {
    const at = room.streamStartedAt ?? room.startedAt ?? room.createdAt;
    items.push({
      id: `host_${room.id}`,
      kind: "live_hosted",
      label: "Hosted live show",
      detail: `${room.title} (${room.status})`,
      at: iso(at),
      href: `/admin/live-shows/${encodeURIComponent(room.id)}`,
    });
  }

  for (const o of bought) {
    items.push({
      id: `buy_${o.id}`,
      kind: "order_bought",
      label: "Bought order",
      detail: `$${o.totalUsd.toFixed(2)} · ${o.status}`,
      at: iso(o.createdAt),
      href: `/admin/orders/${encodeURIComponent(o.id)}`,
    });
  }

  for (const o of sold) {
    items.push({
      id: `sell_${o.id}`,
      kind: "order_sold",
      label: "Sold order",
      detail: `$${o.totalUsd.toFixed(2)} · ${o.status}`,
      at: iso(o.createdAt),
      href: `/admin/orders/${encodeURIComponent(o.id)}`,
    });
  }

  for (const listing of listings) {
    items.push({
      id: `listing_${listing.id}`,
      kind: "listing_created",
      label: "Created listing",
      detail: listing.title,
      at: iso(listing.createdAt),
      href: `/admin/listings?q=${encodeURIComponent(listing.id)}`,
    });
  }

  for (const r of reports) {
    items.push({
      id: `report_${r.id}`,
      kind: "report_filed",
      label: "Filed report",
      detail: `${r.targetType} · ${r.reason}${r.description ? ` — ${r.description.slice(0, 60)}` : ""}`,
      at: iso(r.createdAt),
      href: `/admin/reports/${encodeURIComponent(r.id)}`,
    });
  }

  if (user.createdAt >= since) {
    items.push({
      id: `acct_${user.id}`,
      kind: "account_created",
      label: "Account created",
      detail: null,
      at: iso(user.createdAt),
      href: null,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { userId, items: items.slice(0, limit), lookbackDays };
}
