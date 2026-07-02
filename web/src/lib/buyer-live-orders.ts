import type { BreakSpot, LiveGiveaway, LiveItemVariantPurchase, Order } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadOrderChargeTotalsById,
  orderChargeUsdFromFields,
  resolveChargeUsdFromFulfillmentOrderMap,
} from "@/lib/live-purchase-charge-total";
import {
  PAYMENT_EXPIRED,
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REQUIRES_ACTION,
} from "@/services/payments";

export type BuyerLiveOrderKind = "order" | "break_spot" | "variant_purchase" | "giveaway";

export type BuyerLiveOrderPaymentTone = "paid" | "retry" | "pending";

export type BuyerLiveOrderRow = {
  id: string;
  kind: BuyerLiveOrderKind;
  liveRoomId: string;
  liveRoomTitle: string;
  sellerUsername: string;
  title: string;
  spotLabel: string | null;
  amountUsd: number;
  paymentTone: BuyerLiveOrderPaymentTone;
  statusLabel: string;
  occurredAt: string;
  orderId: string | null;
  thumbnailUrl: string | null;
  href: string;
};

function toneFromOrderPaymentStatus(ps: string): { paymentTone: BuyerLiveOrderPaymentTone; statusLabel: string } {
  if (ps === PAYMENT_PAID) return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === PAYMENT_FAILED || ps === PAYMENT_EXPIRED) return { paymentTone: "retry", statusLabel: "Retry payment" };
  if (ps === PAYMENT_PENDING || ps === PAYMENT_REQUIRES_ACTION) {
    return { paymentTone: "pending", statusLabel: "Pending payment" };
  }
  return { paymentTone: "pending", statusLabel: ps.replace(/_/g, " ") };
}

function toneFromBreakPaymentStatus(ps: string): { paymentTone: BuyerLiveOrderPaymentTone; statusLabel: string } {
  if (ps === PAYMENT_PAID || ps === "paid") return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === "failed" || ps === PAYMENT_FAILED) return { paymentTone: "retry", statusLabel: "Retry payment" };
  if (ps === "pending_payment" || ps === PAYMENT_PENDING) return { paymentTone: "pending", statusLabel: "Pending payment" };
  if (ps === "unpaid") return { paymentTone: "pending", statusLabel: "Payment due" };
  return { paymentTone: "pending", statusLabel: ps.replace(/_/g, " ") };
}

function toneFromVariantPaymentStatus(ps: string): { paymentTone: BuyerLiveOrderPaymentTone; statusLabel: string } {
  if (ps === "paid") return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === "failed") return { paymentTone: "retry", statusLabel: "Retry payment" };
  if (ps === "cancelled") return { paymentTone: "pending", statusLabel: "Canceled" };
  if (ps === "pending_payment") return { paymentTone: "pending", statusLabel: "Pending payment" };
  return { paymentTone: "pending", statusLabel: ps.replace(/_/g, " ") };
}

type OrderRow = Order & {
  seller: { username: string | null };
  listing: { title: string; images: { url: string }[] } | null;
  liveShippingSession: {
    liveShowId: string;
    liveShow: { title: string | null };
  } | null;
};

type BreakSpotRow = BreakSpot & {
  liveRoom: { id: string; title: string | null; seller: { username: string | null } };
};

type VariantPurchaseRow = LiveItemVariantPurchase & {
  variant: { label: string };
  liveRoom: { id: string; title: string | null; seller: { username: string | null } };
};

type GiveawayWinRow = LiveGiveaway & {
  liveRoom: { id: string; title: string | null; seller: { username: string | null } };
};

function mapGiveawayWin(g: GiveawayWinRow): BuyerLiveOrderRow {
  const prizeTitle = g.title.trim() || "Giveaway prize";
  const hasOrder = Boolean(g.fulfillmentOrderId);
  return {
    id: `giveaway:${g.id}`,
    kind: "giveaway",
    liveRoomId: g.liveRoom.id,
    liveRoomTitle: g.liveRoom.title?.trim() || "Live show",
    sellerUsername: g.liveRoom.seller.username?.trim() || "seller",
    title: prizeTitle,
    spotLabel: "Giveaway prize",
    amountUsd: 0,
    paymentTone: "paid",
    statusLabel: hasOrder ? "Giveaway · shipping" : "Giveaway · add address",
    occurredAt: (g.drawnAt ?? g.updatedAt).toISOString(),
    orderId: g.fulfillmentOrderId,
    thumbnailUrl: g.imageUrl?.trim() || null,
    href: hasOrder
      ? `/orders/${encodeURIComponent(g.fulfillmentOrderId!)}`
      : "/account/payment-methods",
  };
}

function mapLiveOrder(o: OrderRow): BuyerLiveOrderRow | null {
  const liveRoomId = o.liveShippingSession?.liveShowId;
  if (!liveRoomId) return null;
  if (o.paymentLabel === "giveaway") return null;
  const { paymentTone, statusLabel } = toneFromOrderPaymentStatus(o.paymentStatus);
  const listingTitle = o.listing?.title?.trim() || "Live purchase";
  return {
    id: `order:${o.id}`,
    kind: "order",
    liveRoomId,
    liveRoomTitle: o.liveShippingSession?.liveShow?.title?.trim() || "Live show",
    sellerUsername: o.seller.username?.trim() || "seller",
    title: listingTitle,
    spotLabel: null,
    amountUsd: orderChargeUsdFromFields({
      totalUsd: o.totalUsd,
      itemPriceUsd: o.itemPriceUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      taxUsd: o.taxUsd,
    }),
    paymentTone,
    statusLabel,
    occurredAt: o.createdAt.toISOString(),
    orderId: o.id,
    thumbnailUrl: o.listing?.images[0]?.url ?? null,
    href: `/orders/${encodeURIComponent(o.id)}`,
  };
}

function mapBreakSpot(s: BreakSpotRow, orderChargeUsdById: ReadonlyMap<string, number>): BuyerLiveOrderRow {
  const { paymentTone, statusLabel } = toneFromBreakPaymentStatus(s.breakPaymentStatus);
  const itemTitle = "Break spot";
  return {
    id: `break_spot:${s.id}`,
    kind: "break_spot",
    liveRoomId: s.liveRoom.id,
    liveRoomTitle: s.liveRoom.title?.trim() || "Live show",
    sellerUsername: s.liveRoom.seller.username?.trim() || "seller",
    title: itemTitle,
    spotLabel: s.spotLabel.trim() || null,
    amountUsd: resolveChargeUsdFromFulfillmentOrderMap(s.priceUsd, s.fulfillmentOrderId, orderChargeUsdById),
    paymentTone,
    statusLabel,
    occurredAt: (s.paidAt ?? s.createdAt).toISOString(),
    orderId: null,
    thumbnailUrl: null,
    href: `/live/${encodeURIComponent(s.liveRoom.id)}`,
  };
}

function mapVariantPurchase(
  vp: VariantPurchaseRow,
  orderChargeUsdById: ReadonlyMap<string, number>,
): BuyerLiveOrderRow {
  const spotLabel = vp.revealedLabel?.trim() || vp.variant.label.trim() || null;
  const { paymentTone, statusLabel: baseStatus } = toneFromVariantPaymentStatus(vp.paymentStatus);
  const statusLabel =
    vp.paymentStatus === "paid" && vp.revealedLabel ? "Team revealed" : baseStatus;
  const itemTitle = vp.variant.label.trim() || "Live spot";
  return {
    id: `variant_purchase:${vp.id}`,
    kind: "variant_purchase",
    liveRoomId: vp.liveRoom.id,
    liveRoomTitle: vp.liveRoom.title?.trim() || "Live show",
    sellerUsername: vp.liveRoom.seller.username?.trim() || "seller",
    title: itemTitle,
    spotLabel,
    amountUsd: resolveChargeUsdFromFulfillmentOrderMap(vp.totalUsd, vp.fulfillmentOrderId, orderChargeUsdById),
    paymentTone,
    statusLabel,
    occurredAt: (vp.paidAt ?? vp.createdAt).toISOString(),
    orderId: null,
    thumbnailUrl: null,
    href: `/live/${encodeURIComponent(vp.liveRoom.id)}`,
  };
}

/** All live-show purchases for a buyer — orders, giveaways, PYT spots, and variant claims. */
export async function fetchBuyerLiveOrders(buyerId: string): Promise<BuyerLiveOrderRow[]> {
  const [sessionOrders, breakSpots, variantPurchases, giveawayWins] = await Promise.all([
    prisma.order.findMany({
      where: {
        buyerId,
        liveShippingSession: { isNot: null },
      },
      include: {
        seller: { select: { username: true } },
        listing: {
          select: {
            title: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        liveShippingSession: {
          select: {
            liveShowId: true,
            liveShow: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.breakSpot.findMany({
      where: { userId: buyerId },
      include: {
        liveRoom: {
          select: {
            id: true,
            title: true,
            seller: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: { buyerId },
      include: {
        variant: { select: { label: true } },
        liveRoom: {
          select: {
            id: true,
            title: true,
            seller: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.liveGiveaway.findMany({
      where: { winnerUserId: buyerId, status: "drawn" },
      include: {
        liveRoom: {
          select: {
            id: true,
            title: true,
            seller: { select: { username: true } },
          },
        },
      },
      orderBy: { drawnAt: "desc" },
      take: 100,
    }),
  ]);

  const orderChargeUsdById = await loadOrderChargeTotalsById([
    ...breakSpots.map((s) => s.fulfillmentOrderId),
    ...variantPurchases.map((vp) => vp.fulfillmentOrderId),
  ].filter((id): id is string => Boolean(id?.trim())));

  const rows: BuyerLiveOrderRow[] = [];
  for (const g of giveawayWins) {
    rows.push(mapGiveawayWin(g));
  }
  for (const o of sessionOrders) {
    const mapped = mapLiveOrder(o);
    if (mapped) rows.push(mapped);
  }
  for (const s of breakSpots) {
    rows.push(mapBreakSpot(s, orderChargeUsdById));
  }
  for (const vp of variantPurchases) {
    rows.push(mapVariantPurchase(vp, orderChargeUsdById));
  }

  rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return rows;
}
