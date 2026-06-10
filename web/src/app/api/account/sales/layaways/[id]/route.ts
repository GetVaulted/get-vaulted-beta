import { NextResponse } from "next/server";
import { accountApiAuthDiagnostics } from "@/lib/account-api-auth-log";
import { deriveSellerLayawayUi } from "@/lib/layaway/seller-ui-status";
import { prisma } from "@/lib/prisma";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) {
    console.warn("[sales/layaways/detail] auth failed", {
      status: auth.status,
      ...accountApiAuthDiagnostics(req),
    });
    return auth;
  }

  const { id } = await ctx.params;
  const layawayId = id?.trim();
  if (!layawayId) return NextResponse.json({ error: "Layaway id required." }, { status: 400 });

  const row = await prisma.layaway.findFirst({
    where: { id: layawayId, sellerId: auth.userId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          priceUsd: true,
          status: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
      buyer: { select: { id: true, username: true } },
      payments: {
        where: { status: "paid" },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          amountUsd: true,
          kind: true,
          paidAt: true,
          createdAt: true,
        },
      },
      order: { select: { id: true, status: true, paymentStatus: true } },
    },
  });

  if (!row) {
    const ownedByOther = await prisma.layaway.findUnique({
      where: { id: layawayId },
      select: { sellerId: true },
    });
    if (ownedByOther && ownedByOther.sellerId !== auth.userId) {
      console.warn("[sales/layaways/detail] forbidden", {
        status: 403,
        userId: auth.userId,
        layawayId,
        ...accountApiAuthDiagnostics(req),
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Layaway not found." }, { status: 404 });
  }

  console.info("[sales/layaways/detail] auth ok", {
    status: 200,
    userId: auth.userId,
    layawayId,
    ...accountApiAuthDiagnostics(req),
  });

  const sellerUi = deriveSellerLayawayUi({
    status: row.status,
    dueAt: row.dueAt,
    remainingBalanceUsd: row.remainingBalanceUsd,
  });

  return NextResponse.json({
    layaway: {
      id: row.id,
      listingId: row.listingId,
      listingTitle: row.listing.title,
      listingImageUrl: row.listing.images[0]?.url ?? null,
      listingPriceUsd: row.listing.priceUsd,
      listingStatus: row.listing.status,
      buyerId: row.buyer.id,
      buyerUsername: row.buyer.username,
      planType: row.planType,
      status: row.status,
      displayStatus: sellerUi.displayStatus,
      originalPriceUsd: row.originalPriceUsd,
      shippingPriceUsd: row.shippingPriceUsd,
      depositAmountUsd: row.depositAmountUsd,
      amountPaidUsd: row.amountPaidUsd,
      remainingBalanceUsd: row.remainingBalanceUsd,
      startedAt: row.startedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      defaultedAt: row.defaultedAt?.toISOString() ?? null,
      orderId: row.orderId,
      orderStatus: row.order.status,
      orderPaymentStatus: row.order.paymentStatus,
      payments: row.payments.map((p) => ({
        id: p.id,
        amountUsd: p.amountUsd,
        kind: p.kind,
        paidAt: (p.paidAt ?? p.createdAt).toISOString(),
      })),
    },
  });
}
