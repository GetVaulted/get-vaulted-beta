import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public aggregate marketplace stats (replaces Supabase RPC for clients). */
export async function GET() {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const [soldToday, completedSales, activeListings] = await Promise.all([
    prisma.order.count({
      where: {
        paymentStatus: "paid",
        createdAt: { gte: startOfDayUtc },
      },
    }),
    prisma.order.count({
      where: {
        paymentStatus: "paid",
        fulfillmentStatus: { in: ["delivered", "in_transit", "out_for_delivery"] },
      },
    }),
    prisma.listing.count({
      where: {
        status: { in: ["active", "auction_live"] },
        moderationRemovedAt: null,
      },
    }),
  ]);

  return NextResponse.json({
    sold_today: soldToday,
    completed_sales: completedSales,
    active_listings: activeListings,
  });
}
