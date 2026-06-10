import { NextResponse } from "next/server";
import type { LayawayStatus } from "@/generated/prisma/client";
import { accountApiAuthDiagnostics } from "@/lib/account-api-auth-log";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOverdueActive(dueAt: Date, status: string): boolean {
  return status === "active" && dueAt.getTime() < Date.now();
}

export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    console.warn("[sales/layaways] auth failed", {
      status: auth.status,
      ...accountApiAuthDiagnostics(req),
    });
    return auth;
  }

  console.info("[sales/layaways] auth ok", {
    status: 200,
    userId: auth.userId,
    ...accountApiAuthDiagnostics(req),
  });

  const statusParam = new URL(req.url).searchParams.get("status");
  const statusFilter =
    statusParam === "active" || statusParam === "completed" || statusParam === "defaulted"
      ? (statusParam as LayawayStatus)
      : null;

  const rows = await prisma.layaway.findMany({
    where: {
      sellerId: auth.userId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
      buyer: { select: { id: true, username: true } },
    },
  });

  const allSellerRows = await prisma.layaway.findMany({
    where: { sellerId: auth.userId },
    select: { status: true, dueAt: true },
  });

  const counts = { active: 0, readyToShip: 0, overdueOrDefaulted: 0 };
  for (const r of allSellerRows) {
    if (r.status === "completed") counts.readyToShip += 1;
    else if (r.status === "defaulted") counts.overdueOrDefaulted += 1;
    else if (r.status === "active") {
      if (isOverdueActive(r.dueAt, r.status)) counts.overdueOrDefaulted += 1;
      else counts.active += 1;
    }
  }

  return NextResponse.json({
    counts,
    layaways: rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      listingTitle: r.listing.title,
      listingImageUrl: r.listing.images[0]?.url ?? null,
      buyerId: r.buyerId,
      buyerUsername: r.buyer.username,
      planType: r.planType,
      status: r.status,
      displayStatus: isOverdueActive(r.dueAt, r.status) ? "overdue" : r.status,
      depositAmountUsd: r.depositAmountUsd,
      amountPaidUsd: r.amountPaidUsd,
      remainingBalanceUsd: r.remainingBalanceUsd,
      startedAt: r.startedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      orderId: r.orderId,
    })),
  });
}
