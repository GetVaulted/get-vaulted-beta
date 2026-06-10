import { NextResponse } from "next/server";
import type { LayawayStatus } from "@/generated/prisma/client";
import { accountApiAuthDiagnostics } from "@/lib/account-api-auth-log";
import {
  deriveSellerLayawayPresentation,
  isActiveLayawayListRow,
} from "@/lib/marketplace/layaway-commerce-state";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { processLayawayMaintenance, repairListingCommerceConflicts } from "@/services/layaway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    console.warn("[sales/layaways] auth failed", {
      status: auth.status,
      ...accountApiAuthDiagnostics(req),
    });
    return auth;
  }

  try {
    await processLayawayMaintenance();
    await repairListingCommerceConflicts();
  } catch (e) {
    console.error("[sales/layaways] maintenance", e);
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
    where: { sellerId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
      buyer: { select: { id: true, username: true } },
      order: { select: { paymentStatus: true } },
    },
  });

  const counts = { active: 0, readyToShip: 0, overdueOrDefaulted: 0 };
  const serialized = rows
    .map((r) => {
      const presentation = deriveSellerLayawayPresentation({
        status: r.status,
        dueAt: r.dueAt,
        remainingBalanceUsd: r.remainingBalanceUsd,
        orderPaymentStatus: r.order.paymentStatus,
        listingStatus: r.listing.status,
        amountPaidUsd: r.amountPaidUsd,
        depositAmountUsd: r.depositAmountUsd,
      });

      if (presentation.bucket === "readyToShip") counts.readyToShip += 1;
      else if (presentation.bucket === "overdueOrDefaulted") counts.overdueOrDefaulted += 1;
      else counts.active += 1;

      return {
        id: r.id,
        listingId: r.listingId,
        listingTitle: r.listing.title,
        listingImageUrl: r.listing.images[0]?.url ?? null,
        listingStatus: r.listing.status,
        buyerId: r.buyerId,
        buyerUsername: r.buyer.username,
        planType: r.planType,
        status: r.status,
        displayStatus: presentation.displayStatus,
        canonicalStatus: presentation.canonical,
        orderPaymentStatus: r.order.paymentStatus,
        depositAmountUsd: r.depositAmountUsd,
        amountPaidUsd: r.amountPaidUsd,
        remainingBalanceUsd: r.remainingBalanceUsd,
        startedAt: r.startedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        dueAt: r.dueAt.toISOString(),
        orderId: r.orderId,
        isActiveLayaway: isActiveLayawayListRow({
          status: r.status,
          dueAt: r.dueAt,
          remainingBalanceUsd: r.remainingBalanceUsd,
          orderPaymentStatus: r.order.paymentStatus,
          listingStatus: r.listing.status,
        }),
      };
    })
    .filter((row) => {
      if (statusFilter === "active") return row.isActiveLayaway;
      if (statusFilter === "completed") return row.canonicalStatus === "layaway_paid_in_full" || row.canonicalStatus === "sold";
      if (statusFilter === "defaulted") {
        return row.displayStatus === "defaulted" || row.displayStatus === "overdue";
      }
      return true;
    });

  return NextResponse.json({
    counts,
    layaways: serialized.map(({ isActiveLayaway: _a, canonicalStatus: _c, ...row }) => row),
  });
}
