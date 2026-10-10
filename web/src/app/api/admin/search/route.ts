import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

type Hit = {
  type: "user" | "order" | "show" | "refund";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const PER_TYPE = 6;

/** Global admin lookup: users, orders, live shows, refund requests from one box. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.trim().replace(/^@/, "").slice(0, 100);
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies Hit[] });

  const contains = { contains: q, mode: "insensitive" as const };

  const [users, orders, shows, refunds] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ username: contains }, { email: contains }, { name: contains }, { id: q }] },
      select: { id: true, username: true, email: true, name: true, role: true, suspendedAt: true },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE,
    }),
    prisma.order.findMany({
      where: {
        OR: [
          { id: q.length >= 8 ? { startsWith: q } : q },
          { stripePaymentIntentId: q },
          { buyer: { username: contains } },
          { seller: { username: contains } },
        ],
      },
      select: {
        id: true,
        totalUsd: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE,
    }),
    prisma.liveRoom.findMany({
      where: { OR: [{ title: contains }, { id: q }, { seller: { username: contains } }] },
      select: { id: true, title: true, status: true, scheduledStartAt: true, seller: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE,
    }),
    prisma.orderRefundRequest.findMany({
      where: {
        OR: [
          { id: q },
          { orderId: q },
          { buyer: { username: contains } },
          { seller: { username: contains } },
        ],
      },
      select: {
        id: true,
        status: true,
        kind: true,
        createdAt: true,
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE,
    }),
  ]);

  const hits: Hit[] = [
    ...users.map((u) => ({
      type: "user" as const,
      id: u.id,
      title: `@${u.username}`,
      subtitle: [u.email, u.name, u.role !== "user" ? u.role : null, u.suspendedAt ? "SUSPENDED" : null]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/users/${u.id}`,
    })),
    ...orders.map((o) => ({
      type: "order" as const,
      id: o.id,
      title: `Order ${o.id.slice(0, 8)} · $${o.totalUsd.toFixed(2)}`,
      subtitle: `@${o.buyer.username} bought from @${o.seller.username} · ${o.status}/${o.paymentStatus}`,
      href: `/admin/orders/${o.id}`,
    })),
    ...shows.map((s) => ({
      type: "show" as const,
      id: s.id,
      title: s.title,
      subtitle: `@${s.seller.username} · ${s.status}${s.scheduledStartAt ? ` · ${s.scheduledStartAt.toISOString().slice(0, 10)}` : ""}`,
      href: `/admin/live-shows/${s.id}`,
    })),
    ...refunds.map((r) => ({
      type: "refund" as const,
      id: r.id,
      title: `Refund request · ${r.kind} · ${r.status}`,
      subtitle: `@${r.buyer.username} vs @${r.seller.username} · ${r.createdAt.toISOString().slice(0, 10)}`,
      href: `/admin/refund-requests?focus=${r.id}`,
    })),
  ];

  return NextResponse.json({ hits });
}
