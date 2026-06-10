import { NextResponse } from "next/server";
import { buildListingCommerceDiagnostics } from "@/lib/marketplace/commerce-state";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { repairStaleActiveLayaways } from "@/services/layaway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ listingId: string }> };

/** Admin-only marketplace commerce debug for a listing. */
export async function GET(_req: Request, ctx: RouteCtx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { listingId: rawId } = await ctx.params;
  const listingId = rawId?.trim();
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  try {
    await repairStaleActiveLayaways();
  } catch (e) {
    console.error("[admin/commerce-debug] repairStaleActiveLayaways", e);
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true, sellerId: true, title: true },
  });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const order = await prisma.order.findUnique({
    where: { listingId },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      trackingNumber: true,
      listing: { select: { status: true } },
      layaway: { select: { status: true, remainingBalanceUsd: true } },
    },
  });

  const layaways = await prisma.layaway.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      status: true,
      dueAt: true,
      remainingBalanceUsd: true,
      amountPaidUsd: true,
      depositAmountUsd: true,
      order: { select: { paymentStatus: true } },
      listing: { select: { status: true } },
    },
  });

  const diagnostics = buildListingCommerceDiagnostics({
    listing,
    orders: order
      ? [
          {
            id: order.id,
            listingId: order.listingId,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            status: order.status,
            paymentStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            trackingNumber: order.trackingNumber,
            listingStatus: order.listing.status,
            layawayStatus: order.layaway?.status ?? null,
            remainingBalanceUsd: order.layaway?.remainingBalanceUsd ?? null,
          },
        ]
      : [],
    layaways: layaways.map((l) => ({
      id: l.id,
      listingId: l.listingId,
      buyerId: l.buyerId,
      sellerId: l.sellerId,
      status: l.status,
      dueAt: l.dueAt,
      remainingBalanceUsd: l.remainingBalanceUsd,
      amountPaidUsd: l.amountPaidUsd,
      depositAmountUsd: l.depositAmountUsd,
      orderPaymentStatus: l.order.paymentStatus,
      listingStatus: l.listing.status,
    })),
  });

  return NextResponse.json({ listingTitle: listing.title, diagnostics });
}
