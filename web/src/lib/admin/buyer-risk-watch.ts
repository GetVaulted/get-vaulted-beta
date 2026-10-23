import { prisma } from "@/lib/prisma";
import {
  addressKey,
  evaluateOrderRisk,
  isLiveRiskOrder,
  RISK_MIN_ORDER_USD,
  RISK_NEW_ACCOUNT_DAYS,
  type RiskFlag,
} from "@/lib/admin/buyer-risk-rules";

const DAY_MS = 86_400_000;

export {
  addressKey,
  evaluateOrderRisk,
  isLiveRiskOrder,
  RISK_FLAG_LABEL,
  RISK_MIN_ORDER_USD,
  RISK_NEW_ACCOUNT_DAYS,
  type RiskFlag,
} from "@/lib/admin/buyer-risk-rules";

export type RiskOrder = {
  id: string;
  createdAt: Date;
  itemPriceUsd: number;
  paymentStatus: string;
  status: string;
  trackingNumber: string | null;
  title: string;
  sellerUsername: string;
  shipTo: string;
  flags: RiskFlag[];
};

export type RiskBuyer = {
  buyerId: string;
  username: string;
  email: string | null;
  accountCreatedAt: Date;
  orders: RiskOrder[];
  paidCount: number;
  paidUsd: number;
  shippedUsd: number;
  openUsd: number;
  flags: RiskFlag[];
};


export async function loadBuyerRiskWatch(opts?: {
  days?: number;
  minUsd?: number;
  newAccountDays?: number;
  now?: Date;
}): Promise<RiskBuyer[]> {
  const now = opts?.now ?? new Date();
  const days = opts?.days ?? 30;
  const minUsd = opts?.minUsd ?? RISK_MIN_ORDER_USD;
  const newDays = opts?.newAccountDays ?? RISK_NEW_ACCOUNT_DAYS;
  const shareWindowStart = new Date(now.getTime() - Math.max(days, 60) * DAY_MS);
  const showSince = new Date(now.getTime() - days * DAY_MS);

  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: shareWindowStart }, itemPriceUsd: { gte: minUsd } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true,
      createdAt: true,
      itemPriceUsd: true,
      paymentStatus: true,
      status: true,
      trackingNumber: true,
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      buyerId: true,
      buyer: { select: { username: true, email: true, createdAt: true } },
      seller: { select: { username: true } },
      listing: { select: { title: true } },
    },
  });

  const buyersAt = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = addressKey(r.shipAddress, r.shipZip);
    if (!key) continue;
    const set = buyersAt.get(key) ?? new Set<string>();
    set.add(r.buyerId);
    buyersAt.set(key, set);
  }

  const byBuyer = new Map<string, RiskBuyer>();
  for (const r of rows) {
    if (r.createdAt < showSince) continue;
    const key = addressKey(r.shipAddress, r.shipZip);
    const flags = evaluateOrderRisk({
      buyerCreatedAt: r.buyer.createdAt,
      orderCreatedAt: r.createdAt,
      itemPriceUsd: r.itemPriceUsd,
      sharedAddress: key !== "" && (buyersAt.get(key)?.size ?? 0) > 1,
      minUsd,
      newAccountDays: newDays,
    });
    if (flags.length === 0) continue;

    const order: RiskOrder = {
      id: r.id,
      createdAt: r.createdAt,
      itemPriceUsd: r.itemPriceUsd,
      paymentStatus: String(r.paymentStatus),
      status: String(r.status),
      trackingNumber: r.trackingNumber ?? null,
      title: r.listing.title,
      sellerUsername: r.seller.username ?? "seller",
      shipTo: [r.shipRecipientName, r.shipCity, r.shipState].filter(Boolean).join(", "),
      flags,
    };
    const buyer =
      byBuyer.get(r.buyerId) ??
      ({
        buyerId: r.buyerId,
        username: r.buyer.username ?? "buyer",
        email: r.buyer.email ?? null,
        accountCreatedAt: r.buyer.createdAt,
        orders: [],
        paidCount: 0,
        paidUsd: 0,
        shippedUsd: 0,
        openUsd: 0,
        flags: [],
      } satisfies RiskBuyer);
    buyer.orders.push(order);
    if (order.paymentStatus === "paid") {
      buyer.paidCount += 1;
      buyer.paidUsd += order.itemPriceUsd;
      if (order.status === "shipped" || order.status === "delivered") buyer.shippedUsd += order.itemPriceUsd;
    } else if (isLiveRiskOrder(order)) {
      buyer.openUsd += order.itemPriceUsd;
    }
    for (const f of flags) if (!buyer.flags.includes(f)) buyer.flags.push(f);
    byBuyer.set(r.buyerId, buyer);
  }

  return [...byBuyer.values()].sort(
    (a, b) => b.paidUsd - a.paidUsd || b.openUsd - a.openUsd || b.orders.length - a.orders.length,
  );
}
