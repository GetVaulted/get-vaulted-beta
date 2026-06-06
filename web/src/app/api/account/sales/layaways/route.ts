import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import type { LayawayStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = new URL(req.url).searchParams.get("status");
  const statusFilter =
    statusParam === "active" || statusParam === "completed" || statusParam === "defaulted"
      ? (statusParam as LayawayStatus)
      : null;

  const rows = await prisma.layaway.findMany({
    where: {
      sellerId: session.user.id,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, username: true } },
    },
  });

  return NextResponse.json({
    layaways: rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      listingTitle: r.listing.title,
      buyerId: r.buyerId,
      buyerUsername: r.buyer.username,
      planType: r.planType,
      status: r.status,
      amountPaidUsd: r.amountPaidUsd,
      remainingBalanceUsd: r.remainingBalanceUsd,
      dueAt: r.dueAt.toISOString(),
      orderId: r.orderId,
    })),
  });
}
