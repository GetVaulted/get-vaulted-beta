import type { BreakSpot, Listing, Order, User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
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
  buyerUsername: string;
  amountUsd: number;
  /** paid = green, retry = red, pending = amber */
  paymentTone: "paid" | "retry" | "pending";
  statusLabel: string;
  occurredAt: string;
  /** Team/division assigned on random reveal, or PYT/PYD spot label. */
  spotLabel?: string | null;
};

function toneFromOrderPaymentStatus(ps: string): { paymentTone: HostRecentSaleRowDTO["paymentTone"]; statusLabel: string } {
  if (ps === PAYMENT_PAID) return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === PAYMENT_FAILED || ps === PAYMENT_EXPIRED) return { paymentTone: "retry", statusLabel: "Retry" };
  if (ps === PAYMENT_PENDING || ps === PAYMENT_REQUIRES_ACTION) return { paymentTone: "pending", statusLabel: "Pending" };
  return { paymentTone: "pending", statusLabel: ps };
}

function toneFromBreakPaymentStatus(ps: string): { paymentTone: HostRecentSaleRowDTO["paymentTone"]; statusLabel: string } {
  if (ps === PAYMENT_PAID || ps === "paid") return { paymentTone: "paid", statusLabel: "Paid" };
  if (ps === "failed" || ps === PAYMENT_FAILED) return { paymentTone: "retry", statusLabel: "Retry" };
  if (ps === "pending_payment" || ps === PAYMENT_PENDING) return { paymentTone: "pending", statusLabel: "Pending" };
  if (ps === "unpaid") return { paymentTone: "pending", statusLabel: "Unpaid" };
  return { paymentTone: "pending", statusLabel: ps };
}

type OrderWithBuyer = Order & {
  buyer: Pick<User, "username">;
  listing?: Pick<Listing, "title"> | null;
};

function mapOrder(o: OrderWithBuyer): HostRecentSaleRowDTO {
  const { paymentTone, statusLabel } =
    o.paymentLabel === "giveaway"
      ? ({ paymentTone: "paid" as const, statusLabel: "Giveaway" })
      : toneFromOrderPaymentStatus(o.paymentStatus);
  const prizeTitle = o.listing?.title?.trim();
  return {
    id: `order:${o.id}`,
    kind: "order",
    buyerUsername: o.buyer?.username?.trim() || "buyer",
    /** Hammer / item price — not order total (shipping + tax are separate). */
    amountUsd: roundUsd(o.itemPriceUsd),
    paymentTone,
    statusLabel,
    occurredAt: o.updatedAt.toISOString(),
    spotLabel: o.paymentLabel === "giveaway" ? prizeTitle ?? "Giveaway prize" : null,
  };
}

type SpotWithUser = BreakSpot & { user: Pick<User, "username"> };

function mapBreakSpot(s: SpotWithUser): HostRecentSaleRowDTO {
  const { paymentTone, statusLabel } = toneFromBreakPaymentStatus(s.breakPaymentStatus);
  const occurredAt = (s.paidAt ?? s.createdAt).toISOString();
  return {
    id: `break_spot:${s.id}`,
    kind: "break_spot",
    buyerUsername: s.user?.username?.trim() || "buyer",
    amountUsd: s.priceUsd,
    paymentTone,
    statusLabel,
    occurredAt,
  };
}

/**
 * Orders and break-spot checkouts tied to this live room (listing queue + shipping session + spots).
 */
export async function fetchHostRecentSales(liveRoomId: string, sellerId: string): Promise<HostRecentSaleRowDTO[]> {
  const listingRows = await prisma.liveRoomItem.findMany({
    where: { liveRoomId, listingId: { not: null } },
    select: { listingId: true },
  });
  const listingIds = [...new Set(listingRows.map((r) => r.listingId).filter((x): x is string => Boolean(x)))];

  const [ordersByListing, ordersBySession, spots, variantPurchases] = await Promise.all([
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
      where: { liveRoomId, paymentStatus: "paid" },
      include: {
        buyer: { select: { username: true } },
        variant: { select: { label: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
  ]);

  const orderById = new Map<string, OrderWithBuyer>();
  for (const o of [...ordersByListing, ...ordersBySession]) {
    if (!orderById.has(o.id)) orderById.set(o.id, o);
  }

  const rows: HostRecentSaleRowDTO[] = [];
  for (const o of orderById.values()) {
    rows.push(mapOrder(o));
  }
  for (const s of spots) {
    rows.push(mapBreakSpot(s));
  }
  for (const vp of variantPurchases) {
    const spotLabel = vp.revealedLabel?.trim() || vp.variant.label;
    rows.push({
      id: `variant_purchase:${vp.id}`,
      kind: "variant_purchase",
      buyerUsername: vp.buyer?.username?.trim() || "buyer",
      amountUsd: vp.totalUsd,
      paymentTone: "paid",
      statusLabel: vp.revealedLabel ? "Revealed" : "Paid",
      occurredAt: (vp.paidAt ?? vp.createdAt).toISOString(),
      spotLabel,
    });
  }

  rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return rows.slice(0, 25);
}
