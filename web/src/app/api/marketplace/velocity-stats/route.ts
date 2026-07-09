import { NextResponse } from "next/server";
import { prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { PUBLIC_MARKETPLACE_LISTING_WHERE } from "@/lib/marketplace-commerce-policy";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public aggregate marketplace stats (replaces Supabase RPC for clients). */
export async function GET() {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const browseWhere = {
    ...PUBLIC_MARKETPLACE_LISTING_WHERE,
    seller: prismaSellerVisibleOnPublicMarketplace(),
  };

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
    prisma.listing.count({ where: browseWhere }),
  ]);

  return NextResponse.json({
    sold_today: soldToday,
    completed_sales: completedSales,
    active_listings: activeListings,
  });
}
