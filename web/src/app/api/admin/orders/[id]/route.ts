import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          category: true,
          buyingFormat: true,
          moderationRemovedAt: true,
          seller: { select: { id: true, username: true, email: true, trustapUserId: true } },
        },
      },
      buyer: { select: { id: true, username: true, email: true } },
      seller: { select: { id: true, username: true, email: true, trustapUserId: true } },
    },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      totalUsd: order.totalUsd,
      itemPriceUsd: order.itemPriceUsd,
      shippingPriceUsd: order.shippingPriceUsd,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      paymentLabel: order.paymentLabel,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      shipRecipientName: order.shipRecipientName,
      shipAddress: order.shipAddress,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipZip: order.shipZip,
      shipCountry: order.shipCountry,
      paymentMethod: order.paymentMethod,
      escrowProvider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId,
      escrowStatus: order.escrowStatus,
      escrowCheckoutUrl: order.escrowCheckoutUrl,
      escrowFeeCents: order.escrowFeeCents,
      escrowReleasePaused: order.escrowReleasePaused,
      fundsReleasedAt: order.fundsReleasedAt?.toISOString() ?? null,
      trustapBuyerUserId: order.trustapBuyerUserId,
      fulfillmentStatus: order.fulfillmentStatus,
      shippingChargedCents: order.shippingChargedCents,
      shippingLabelCostCents: order.shippingLabelCostCents,
      shippingMarginCents:
        order.shippingChargedCents != null && order.shippingLabelCostCents != null
          ? order.shippingChargedCents - order.shippingLabelCostCents
          : null,
      buyer: order.buyer,
      seller: order.seller,
      listing: {
        ...order.listing,
        moderationRemovedAt: order.listing.moderationRemovedAt?.toISOString() ?? null,
      },
    },
  });
}
