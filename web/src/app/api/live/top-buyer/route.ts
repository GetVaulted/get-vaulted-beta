import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const TTL_MS = 10 * 60 * 1000;
let memo: { userId: string | null; at: number } | null = null;

/**
 * GET — the platform's top buyer (most paid orders, all-time; ties broken by total spend).
 * Public, tiny, and cached in memory plus at the edge so chat can badge them without per-message lookups.
 */
export async function GET() {
  const now = Date.now();
  if (!memo || now - memo.at > TTL_MS) {
    const rows = await prisma.order.groupBy({
      by: ["buyerId"],
      where: { paymentStatus: "paid" },
      _count: { id: true },
      _sum: { totalUsd: true },
      orderBy: [{ _count: { id: "desc" } }, { _sum: { totalUsd: "desc" } }],
      take: 1,
    });
    memo = { userId: rows[0]?.buyerId ?? null, at: now };
  }
  return NextResponse.json(
    { userId: memo.userId },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
