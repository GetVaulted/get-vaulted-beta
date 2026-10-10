import { prisma } from "@/lib/prisma";

export type DailyRow = {
  day: string; // YYYY-MM-DD (UTC)
  orders: number;
  gmvUsd: number;
  refunds: number;
  newMembers: number;
};

export type SellerRow = { sellerId: string; username: string; orders: number; gmvUsd: number };

export type DailyReport = {
  days: DailyRow[];
  totals: { orders: number; gmvUsd: number; refunds: number; newMembers: number; refundRatePct: number };
  topSellers: SellerRow[];
  truncated: boolean;
};

const ORDER_CAP = 50_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pure: lay out an empty row per UTC day, oldest first, ending today. */
export function emptyDays(days: number, now = new Date()): DailyRow[] {
  const out: DailyRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push({ day: dayKey(d), orders: 0, gmvUsd: 0, refunds: 0, newMembers: 0 });
  }
  return out;
}

export function summarizeDaily(rows: DailyRow[]): DailyReport["totals"] {
  const t = rows.reduce(
    (a, r) => ({ orders: a.orders + r.orders, gmvUsd: a.gmvUsd + r.gmvUsd, refunds: a.refunds + r.refunds, newMembers: a.newMembers + r.newMembers }),
    { orders: 0, gmvUsd: 0, refunds: 0, newMembers: 0 },
  );
  return { ...t, gmvUsd: Math.round(t.gmvUsd * 100) / 100, refundRatePct: t.orders > 0 ? Math.round((t.refunds / t.orders) * 1000) / 10 : 0 };
}

export async function loadDailyReport(daysRaw: number, now = new Date()): Promise<DailyReport> {
  const days = Math.min(Math.max(Math.floor(daysRaw) || 30, 1), 90);
  const rows = emptyDays(days, now);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const since = new Date(`${rows[0].day}T00:00:00.000Z`);

  const [orders, refunds, members] = await Promise.all([
    prisma.order.findMany({
      where: { paymentStatus: { in: ["paid", "layaway_completed"] }, createdAt: { gte: since } },
      select: { sellerId: true, totalUsd: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: ORDER_CAP + 1,
    }),
    prisma.orderRefundRequest.findMany({ where: { refundedAt: { gte: since } }, select: { refundedAt: true } }),
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  const truncated = orders.length > ORDER_CAP;
  const used = truncated ? orders.slice(0, ORDER_CAP) : orders;
  const sellers = new Map<string, { orders: number; gmvUsd: number }>();
  for (const o of used) {
    const r = byDay.get(dayKey(o.createdAt));
    if (r) {
      r.orders += 1;
      r.gmvUsd += o.totalUsd;
    }
    const s = sellers.get(o.sellerId) ?? { orders: 0, gmvUsd: 0 };
    s.orders += 1;
    s.gmvUsd += o.totalUsd;
    sellers.set(o.sellerId, s);
  }
  for (const r of refunds) {
    const row = r.refundedAt ? byDay.get(dayKey(r.refundedAt)) : undefined;
    if (row) row.refunds += 1;
  }
  for (const m of members) {
    const row = byDay.get(dayKey(m.createdAt));
    if (row) row.newMembers += 1;
  }
  for (const r of rows) r.gmvUsd = Math.round(r.gmvUsd * 100) / 100;

  const top = [...sellers.entries()].sort((a, b) => b[1].gmvUsd - a[1].gmvUsd).slice(0, 15);
  const names = top.length
    ? await prisma.user.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, username: true } })
    : [];
  const nameOf = new Map(names.map((u) => [u.id, u.username]));

  return {
    days: rows,
    totals: summarizeDaily(rows),
    topSellers: top.map(([sellerId, v]) => ({
      sellerId,
      username: nameOf.get(sellerId) ?? sellerId.slice(0, 8),
      orders: v.orders,
      gmvUsd: Math.round(v.gmvUsd * 100) / 100,
    })),
    truncated,
  };
}
