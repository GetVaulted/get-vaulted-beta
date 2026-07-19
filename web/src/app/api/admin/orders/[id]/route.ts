import { NextResponse } from "next/server";
import { buildOrderShippingReconciliation } from "@/lib/admin/shipping-reconciliation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { loadOrderPayoutDetailForAdmin } from "@/services/payout/process-delivery-payout";

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
      liveShippingSession: {
        select: {
          id: true,
          shippingChargedCents: true,
          estimatedLabelCostCents: true,
          finalLabelCostCents: true,
          shippingMode: true,
        },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payoutDetail = await loadOrderPayoutDetailForAdmin(id);
  const shippingReconciliation = buildOrderShippingReconciliation({
    id: order.id,
    sellerId: order.sellerId,
    paymentStatus: order.paymentStatus,
    payoutStatus: order.payoutStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    shippingStatus: order.shippingStatus,
    shippingPriceUsd: order.shippingPriceUsd,
    shippingChargedCents: order.shippingChargedCents,
    shippingLabelCostCents: order.shippingLabelCostCents,
    shippingLabelCostReversedCents: order.shippingLabelCostReversedCents,
    shippingLabelCostReversalId: order.shippingLabelCostReversalId,
    shippoTransactionId: order.shippoTransactionId,
    labelUrl: order.labelUrl,
    labelCreatedAt: order.labelCreatedAt,
    liveShippingSessionId: order.liveShippingSessionId,
  });

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
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      escrowProvider: order.escrowProvider,
      escrowTransactionId: order.escrowTransactionId,
      escrowStatus: order.escrowStatus,
      escrowCheckoutUrl: order.escrowCheckoutUrl,
      escrowFeeCents: order.escrowFeeCents,
      escrowReleasePaused: order.escrowReleasePaused,
      fundsReleasedAt: order.fundsReleasedAt?.toISOString() ?? null,
      trustapBuyerUserId: order.trustapBuyerUserId,
      shippingChargedCents: order.shippingChargedCents,
      shippingLabelCostCents: order.shippingLabelCostCents,
      shippingLabelCostReversedCents: order.shippingLabelCostReversedCents,
      shippingLabelCostReversalId: order.shippingLabelCostReversalId,
      shippoTransactionId: order.shippoTransactionId,
      labelUrl: order.labelUrl,
      labelCreatedAt: order.labelCreatedAt?.toISOString() ?? null,
      shippingStatus: order.shippingStatus,
      /** Legacy field — buyer shipping minus label cost. Not platform margin (buyer shipping is seller pass-through). */
      shippingMarginCents:
        order.shippingChargedCents != null && order.shippingLabelCostCents != null
          ? order.shippingChargedCents - order.shippingLabelCostCents
          : null,
      shippingReconciliation,
      liveShippingSession: order.liveShippingSession
        ? {
            id: order.liveShippingSession.id,
            shippingChargedCents: order.liveShippingSession.shippingChargedCents,
            estimatedLabelCostCents: order.liveShippingSession.estimatedLabelCostCents,
            finalLabelCostCents: order.liveShippingSession.finalLabelCostCents,
            shippingMode: order.liveShippingSession.shippingMode,
          }
        : null,
      payoutStatus: order.payoutStatus,
      deliveryConfirmedAt: order.deliveryConfirmedAt?.toISOString() ?? null,
      payoutEligibleAt: order.payoutEligibleAt?.toISOString() ?? null,
      payoutReleasedAt: order.payoutReleasedAt?.toISOString() ?? null,
      payoutBlockedReason: order.payoutBlockedReason,
      payoutMethod: order.payoutMethod,
      payoutReserveAmountCents: order.payoutReserveAmountCents,
      payoutHoldUntil: order.payoutHoldUntil?.toISOString() ?? null,
      buyer: order.buyer,
      seller: order.seller,
      listing: {
        ...order.listing,
        moderationRemovedAt: order.listing.moderationRemovedAt?.toISOString() ?? null,
      },
      payoutEvaluation: payoutDetail
        ? {
            sellerEligible: payoutDetail.sellerEval.eligible,
            instantPayoutAllowed: payoutDetail.orderEval.instantPayoutAllowed,
            disqualifiers: payoutDetail.orderEval.disqualifiers,
            sellerRequirementsFailed: payoutDetail.sellerEval.requirementsFailed,
          }
        : null,
    },
  });
}
