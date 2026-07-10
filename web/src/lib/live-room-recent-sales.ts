import type { BreakSpot, Listing, Order, User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadOrderChargeTotalsById,
  orderChargeUsdFromFields,
  resolveChargeUsdFromFulfillmentOrderMap,
} from "@/lib/live-purchase-charge-total";
import { liveShowFulfillmentOrderIds } from "@/lib/live-show-fulfillment-order-ids";
import { roundUsd } from "@/lib/round-usd";
import {
  PAYMENT_EXPIRED,
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REQUIRES_ACTION,
} from "@/services/payments";

export type HostRecentSaleRowDTO = {
  id: string;
  kind: "order" | "break_spot" | "variant_purchase";
  /** Primary line for seller dashboards — lot title, break name, or prize. */
  itemTitle: string;
  buyerUsername: string;
  amountUsd: number;
  /** paid = green, retry = red, pending = amber */
  paymentTone: "paid" | "retry" | "pending";
  statusLabel: string;
  occurredAt: string;
  /** Team/division assigned on random reveal, or PYT/PYD spot label. */
  spotLabel?: string | null;
};

function toneFromVariantPaymentStatus(ps: string): { paymentTone: HostRecentSaleRowDTO["paymentTone"]; statusLabel: string } {
  if (ps === "paid") return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === "failed") return { paymentTone: "retry", statusLabel: "Failed" };
  return { paymentTone: "pending", statusLabel: "Pending" };
}

function toneFromOrderPaymentStatus(ps: string): { paymentTone: HostRecentSaleRowDTO["paymentTone"]; statusLabel: string } {
  if (ps === PAYMENT_PAID) return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === PAYMENT_FAILED || ps === PAYMENT_EXPIRED) return { paymentTone: "retry", statusLabel: "Failed" };
  if (ps === PAYMENT_PENDING || ps === PAYMENT_REQUIRES_ACTION) return { paymentTone: "pending", statusLabel: "Pending" };
  return { paymentTone: "pending", statusLabel: ps };
}

function toneFromBreakPaymentStatus(ps: string): { paymentTone: HostRecentSaleRowDTO["paymentTone"]; statusLabel: string } {
  if (ps === PAYMENT_PAID || ps === "paid") return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === "failed" || ps === PAYMENT_FAILED) return { paymentTone: "retry", statusLabel: "Failed" };
  if (ps === "pending_payment" || ps === PAYMENT_PENDING) return { paymentTone: "pending", statusLabel: "Pending" };
  if (ps === "unpaid") return { paymentTone: "pending", statusLabel: "Unpaid" };
  return { paymentTone: "pending", statusLabel: ps };
}

/** Seller recent-sales list shows settled outcomes and in-flight payments (not cancelled). */
export function includeHostRecentSaleRow(row: Pick<HostRecentSaleRowDTO, "paymentTone">): boolean {
  return row.paymentTone === "paid" || row.paymentTone === "retry" || row.paymentTone === "pending";
}

type SpotCommerceAnchor = {
  buyerId: string;
  amountUsd: number;
  fulfillmentOrderId: string | null;
  paid: boolean;
};

/** Hide marketplace order rows when the live room already has the spot/variant sale row. */
export function shouldHideOrderForSpotCommerceRow(
  order: { id: string; buyerId: string; itemPriceUsd: number },
  anchors: SpotCommerceAnchor[],
): boolean {
  for (const anchor of anchors) {
    if (anchor.fulfillmentOrderId === order.id) return true;
    if (!anchor.paid) continue;
    if (anchor.buyerId !== order.buyerId) continue;
    if (roundUsd(anchor.amountUsd) === roundUsd(order.itemPriceUsd)) return true;
  }
  return false;
}

type OrderWithBuyer = Order & {
  buyer: Pick<User, "username">;
  listing?: Pick<Listing, "title"> | null;
};

function itemDisplayTitle(item: { title?: string | null } | null | undefined, fallback: string): string {
  const title = item?.title?.trim();
  return title || fallback;
}

function mapOrder(o: OrderWithBuyer): HostRecentSaleRowDTO {
  const { paymentTone, statusLabel } =
    o.paymentLabel === "giveaway"
      ? ({ paymentTone: "paid" as const, statusLabel: "Giveaway" })
      : toneFromOrderPaymentStatus(o.paymentStatus);
  const prizeTitle = o.listing?.title?.trim();
  const itemTitle =
    o.paymentLabel === "giveaway" ? prizeTitle ?? "Giveaway prize" : prizeTitle ?? "Live sale";
  return {
    id: `order:${o.id}`,
    kind: "order",
    itemTitle,
    buyerUsername: o.buyer?.username?.trim() || "buyer",
    amountUsd: orderChargeUsdFromFields({
      totalUsd: o.totalUsd,
      itemPriceUsd: o.itemPriceUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      taxUsd: o.taxUsd,
    }),
    paymentTone,
    statusLabel,
    occurredAt: o.updatedAt.toISOString(),
    spotLabel: o.paymentLabel === "giveaway" ? prizeTitle ?? "Giveaway prize" : null,
  };
}

type SpotWithUser = BreakSpot & { user: Pick<User, "username"> };

function mapBreakSpot(
  s: SpotWithUser,
  itemTitleById: Map<string, string>,
  orderChargeUsdById: ReadonlyMap<string, number>,
): HostRecentSaleRowDTO {
  const { paymentTone, statusLabel } = toneFromBreakPaymentStatus(s.breakPaymentStatus);
  const occurredAt = (s.paidAt ?? s.createdAt).toISOString();
  const spotLabel = s.spotLabel?.trim() || null;
  const itemTitle =
    (s.liveRoomItemId ? itemTitleById.get(s.liveRoomItemId) : null)?.trim() || spotLabel || "Break spot";
  return {
    id: `break_spot:${s.id}`,
    kind: "break_spot",
    itemTitle,
    buyerUsername: s.user?.username?.trim() || "buyer",
    amountUsd: resolveChargeUsdFromFulfillmentOrderMap(s.priceUsd, s.fulfillmentOrderId, orderChargeUsdById),
    paymentTone,
    statusLabel,
    occurredAt,
    spotLabel,
  };
}

type VariantPurchaseWithBuyer = {
  id: string;
  buyerId: string;
  totalUsd: number;
  unitPriceUsd: number;
  quantity: number;
  paymentStatus: string;
  paidAt: Date | null;
  createdAt: Date;
  revealedLabel: string | null;
  fulfillmentOrderId: string | null;
  buyer: Pick<User, "username"> | null;
  variant: {
    label: string;
    liveRoomItem: { title: string };
  };
};

function mapVariantPurchase(
  vp: VariantPurchaseWithBuyer,
  orderChargeUsdById: ReadonlyMap<string, number>,
): HostRecentSaleRowDTO | null {
  if (vp.paymentStatus === "cancelled") return null;
  const { paymentTone, statusLabel } = toneFromVariantPaymentStatus(vp.paymentStatus);
  const spotLabel = vp.revealedLabel?.trim() || vp.variant.label;
  return {
    id: `variant_purchase:${vp.id}`,
    kind: "variant_purchase",
    itemTitle: itemDisplayTitle(vp.variant.liveRoomItem, spotLabel),
    buyerUsername: vp.buyer?.username?.trim() || "buyer",
    amountUsd: resolveChargeUsdFromFulfillmentOrderMap(vp.totalUsd, vp.fulfillmentOrderId, orderChargeUsdById),
    paymentTone,
    statusLabel:
      vp.paymentStatus === "paid" && vp.revealedLabel
        ? "Revealed"
        : vp.paymentStatus === "pending_payment"
          ? "Processing"
          : statusLabel,
    occurredAt: (vp.paidAt ?? vp.createdAt).toISOString(),
    spotLabel,
  };
}

/**
 * Orders and break-spot checkouts tied to this live room (listing queue + shipping session + spots).
 */
export async function fetchHostRecentSales(liveRoomId: string, sellerId: string): Promise<HostRecentSaleRowDTO[]> {
  try {
    const { reconcileLiveRoomPendingVariantPurchases } = await import("@/lib/live-payment-pipeline");
    await reconcileLiveRoomPendingVariantPurchases(liveRoomId);
  } catch (e) {
    console.warn("[live-room-recent-sales] reconcile pending variant purchases", liveRoomId, e);
  }

  const listingRows = await prisma.liveRoomItem.findMany({
    where: { liveRoomId, listingId: { not: null } },
    select: { listingId: true },
  });
  const listingIds = [...new Set(listingRows.map((r) => r.listingId).filter((x): x is string => Boolean(x)))];
  const fulfillmentOrderIds = await liveShowFulfillmentOrderIds(liveRoomId);

  const [ordersByListing, ordersBySession, ordersByFulfillment, spots, variantPurchases, drawnGiveaways] =
    await Promise.all([
    listingIds.length
      ? prisma.order.findMany({
          where: { sellerId, listingId: { in: listingIds } },
          include: {
            buyer: { select: { username: true } },
            listing: { select: { title: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : Promise.resolve([] as OrderWithBuyer[]),
    prisma.order.findMany({
      where: {
        sellerId,
        liveShippingSession: { is: { liveShowId: liveRoomId } },
      },
      include: {
        buyer: { select: { username: true } },
        listing: { select: { title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    fulfillmentOrderIds.length
      ? prisma.order.findMany({
          where: { sellerId, id: { in: fulfillmentOrderIds } },
          include: {
            buyer: { select: { username: true } },
            listing: { select: { title: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : Promise.resolve([] as OrderWithBuyer[]),
    prisma.breakSpot.findMany({
      where: {
        liveRoomId,
        OR: [{ breakPaymentStatus: { not: "unpaid" } }, { paidAt: { not: null } }],
      },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: { liveRoomId, paymentStatus: { in: ["paid", "failed", "pending_payment"] } },
      include: {
        buyer: { select: { username: true } },
        variant: {
          select: {
            label: true,
            liveRoomItem: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.liveGiveaway.findMany({
      where: { liveRoomId, status: "drawn", winnerUserId: { not: null } },
      include: { winnerUser: { select: { username: true } } },
      orderBy: { drawnAt: "desc" },
      take: 50,
    }),
  ]);

  const orderById = new Map<string, OrderWithBuyer>();
  for (const o of [...ordersByListing, ...ordersBySession, ...ordersByFulfillment]) {
    if (!orderById.has(o.id)) orderById.set(o.id, o);
  }

  const fulfillmentOrderIdSet = new Set(fulfillmentOrderIds);

  const spotCommerceAnchors: SpotCommerceAnchor[] = [
    ...spots.map((s) => ({
      buyerId: s.userId,
      amountUsd: s.priceUsd,
      fulfillmentOrderId: s.fulfillmentOrderId,
      paid:
        s.breakPaymentStatus === PAYMENT_PAID ||
        s.breakPaymentStatus === "paid" ||
        s.paidAt != null,
    })),
    ...variantPurchases.map((vp) => ({
      buyerId: vp.buyerId,
      amountUsd: roundUsd(vp.unitPriceUsd * vp.quantity),
      fulfillmentOrderId: vp.fulfillmentOrderId,
      paid: vp.paymentStatus === "paid",
    })),
  ];

  const spotItemIds = [
    ...new Set(spots.map((s) => s.liveRoomItemId).filter((id): id is string => Boolean(id))),
  ];
  const spotItemRows =
    spotItemIds.length > 0
      ? await prisma.liveRoomItem.findMany({
          where: { id: { in: spotItemIds } },
          select: { id: true, title: true },
        })
      : [];
  const spotItemTitleById = new Map(spotItemRows.map((row) => [row.id, row.title]));

  const fulfillmentChargeOrderIds = [
    ...spots.map((s) => s.fulfillmentOrderId),
    ...variantPurchases.map((vp) => vp.fulfillmentOrderId),
  ].filter((id): id is string => Boolean(id?.trim()));
  const orderChargeUsdById = await loadOrderChargeTotalsById(fulfillmentChargeOrderIds);

  const rows: HostRecentSaleRowDTO[] = [];
  for (const o of orderById.values()) {
    if (fulfillmentOrderIdSet.has(o.id)) continue;
    if (shouldHideOrderForSpotCommerceRow(o, spotCommerceAnchors)) continue;
    const mapped = mapOrder(o);
    if (!includeHostRecentSaleRow(mapped)) continue;
    rows.push(mapped);
  }
  for (const s of spots) {
    const mapped = mapBreakSpot(s, spotItemTitleById, orderChargeUsdById);
    if (!includeHostRecentSaleRow(mapped)) continue;
    rows.push(mapped);
  }
  for (const vp of variantPurchases) {
    const mapped = mapVariantPurchase(vp, orderChargeUsdById);
    if (!mapped || !includeHostRecentSaleRow(mapped)) continue;
    rows.push(mapped);
  }

  const coveredOrderIds = new Set(
    [...orderById.values()]
      .map((o) => o.id)
      .filter((id): id is string => Boolean(id)),
  );
  for (const g of drawnGiveaways) {
    if (g.fulfillmentOrderId && coveredOrderIds.has(g.fulfillmentOrderId)) continue;
    const prizeTitle = g.title.trim() || "Giveaway prize";
    rows.push({
      id: `giveaway:${g.id}`,
      kind: "order",
      itemTitle: prizeTitle,
      buyerUsername: g.winnerUser?.username?.trim() || "winner",
      amountUsd: 0,
      paymentTone: "paid",
      statusLabel: g.fulfillmentOrderId ? "Giveaway" : "Giveaway · ship pending",
      occurredAt: (g.drawnAt ?? g.updatedAt).toISOString(),
      spotLabel: prizeTitle,
    });
  }

  rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return rows.slice(0, 25);
}
