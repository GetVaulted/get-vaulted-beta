import { deriveBuyerLayawayUi } from "@/lib/layaway/buyer-ui-status";

type LayawayRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl: string | null;
  planType: string;
  status: string;
  originalPriceUsd: number;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  startedAt: string;
  dueAt: string;
  completedAt: string | null;
  orderId: string;
  orderPaymentStatus: string;
  displayStatus: string;
  canMakePayment: boolean;
  statusMessage: string | null;
};

export function serializeBuyerLayawayRow(r: {
  id: string;
  listingId: string;
  listing: { title: string; images: { url: string }[] };
  planType: string;
  status: string;
  originalPriceUsd: number;
  depositAmountUsd: number;
  amountPaidUsd: number;
  remainingBalanceUsd: number;
  startedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  orderId: string;
  order: { paymentStatus: string };
}): LayawayRow {
  const ui = deriveBuyerLayawayUi({
    status: r.status,
    amountPaidUsd: r.amountPaidUsd,
    depositAmountUsd: r.depositAmountUsd,
    remainingBalanceUsd: r.remainingBalanceUsd,
    orderPaymentStatus: r.order.paymentStatus,
  });

  return {
    id: r.id,
    listingId: r.listingId,
    listingTitle: r.listing.title,
    listingImageUrl: r.listing.images[0]?.url ?? null,
    planType: r.planType,
    status: r.status,
    originalPriceUsd: r.originalPriceUsd,
    depositAmountUsd: r.depositAmountUsd,
    amountPaidUsd: r.amountPaidUsd,
    remainingBalanceUsd: r.remainingBalanceUsd,
    startedAt: r.startedAt.toISOString(),
    dueAt: r.dueAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    orderId: r.orderId,
    orderPaymentStatus: r.order.paymentStatus,
    displayStatus: ui.badgeLabel,
    canMakePayment: ui.canMakePayment,
    statusMessage: ui.message,
  };
}

export type { LayawayRow as BuyerLayawayApiRow };
