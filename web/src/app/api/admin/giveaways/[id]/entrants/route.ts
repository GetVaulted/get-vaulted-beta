import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id: campaignId } = await ctx.params;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));

  const grouped = await prisma.giveawayEntryLedger.groupBy({
    by: ["userId"],
    where: { campaignId },
    _sum: { quantity: true },
    _count: { _all: true },
  });

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, email: true, createdAt: true, emailVerified: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  let rows = grouped.map((g) => {
    const u = userById.get(g.userId);
    return {
      userId: g.userId,
      username: u?.username ?? null,
      email: u?.email ?? null,
      emailVerified: u?.emailVerified?.toISOString() ?? null,
      createdAt: u?.createdAt?.toISOString() ?? null,
      totalEntries: g._sum.quantity ?? 0,
      ledgerRows: g._count._all,
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.username?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.userId.includes(q),
    );
  }

  rows.sort((a, b) => b.totalEntries - a.totalEntries);
  return NextResponse.json({ entrants: rows.slice(0, limit), total: rows.length });
}
