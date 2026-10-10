import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/** User 360: everything an admin needs about one person on a single screen (read-only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, role: true, suspendedAt: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orderSelect = {
    id: true,
    totalUsd: true,
    status: true,
    paymentStatus: true,
    fulfillmentStatus: true,
    createdAt: true,
    listing: { select: { title: true } },
    buyer: { select: { username: true } },
    seller: { select: { username: true } },
  } as const;

  const [bought, sold, boughtAgg, soldAgg, refunds, shows, adminLog, tickets] = await Promise.all([
    prisma.order.findMany({ where: { buyerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: orderSelect }),
    prisma.order.findMany({ where: { sellerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: orderSelect }),
    prisma.order.aggregate({ where: { buyerId: id }, _count: true, _sum: { totalUsd: true } }),
    prisma.order.aggregate({ where: { sellerId: id }, _count: true, _sum: { totalUsd: true } }),
    prisma.orderRefundRequest.findMany({
      where: { OR: [{ buyerId: id }, { sellerId: id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        orderId: true,
        kind: true,
        status: true,
        reason: true,
        buyerId: true,
        createdAt: true,
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
    }),
    prisma.liveRoom.findMany({
      where: { sellerId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, scheduledStartAt: true, completedSalesGmvUsd: true },
    }),
    prisma.adminActionLog.findMany({
      where: { OR: [{ targetUserId: id }, { targetType: "user", targetId: id }] },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.supportTicket.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, subject: true, status: true, category: true, createdAt: true },
    }),
  ]);

  const fmtOrder = (o: (typeof bought)[number]) => ({
    id: o.id,
    title: o.listing?.title ?? "(item)",
    totalUsd: o.totalUsd,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    buyer: o.buyer.username,
    seller: o.seller.username,
    createdAt: o.createdAt.toISOString(),
  });

  return NextResponse.json({
    username: user.username,
    tickets: tickets.map((t) => ({ ...t, status: String(t.status), category: String(t.category), createdAt: t.createdAt.toISOString() })),
    user: { ...user, createdAt: user.createdAt.toISOString(), suspendedAt: user.suspendedAt?.toISOString() ?? null },
    totals: {
      boughtCount: boughtAgg._count,
      boughtUsd: boughtAgg._sum.totalUsd ?? 0,
      soldCount: soldAgg._count,
      soldUsd: soldAgg._sum.totalUsd ?? 0,
    },
    bought: bought.map(fmtOrder),
    sold: sold.map(fmtOrder),
    refunds: refunds.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      kind: r.kind,
      status: r.status,
      reason: r.reason.slice(0, 200),
      role: r.buyerId === id ? "buyer" : "seller",
      buyer: r.buyer.username,
      seller: r.seller.username,
      createdAt: r.createdAt.toISOString(),
    })),
    shows: shows.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      scheduledStartAt: s.scheduledStartAt?.toISOString() ?? null,
      gmvUsd: s.completedSalesGmvUsd,
    })),
    adminLog: adminLog.map((l) => ({
      id: l.id,
      action: l.action,
      reason: l.reason,
      adminUserId: l.adminUserId,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
