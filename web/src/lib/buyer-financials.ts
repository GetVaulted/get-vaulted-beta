import {
  calendarDayBoundsUtc,
  calendarDayInTimeZone,
  isValidIanaTimeZone,
  zonedLocalToUtc,
} from "@/lib/calendar-day-bounds";
import { prisma } from "@/lib/prisma";
import { getAvailablePlatformCreditUsd } from "@/lib/giveaway/platform-credit";
import { getUserReferralSummary } from "@/lib/referral-credit";
import {
  PAYMENT_FAILED,
  PAYMENT_PAID,
  PAYMENT_PENDING,
  PAYMENT_REQUIRES_ACTION,
} from "@/services/payments";

export type BuyerFinancialActivityRow = {
  id: string;
  title: string;
  subtitle: string;
  amountUsd: number;
  channel: "marketplace" | "live" | "layaway" | "credit";
  statusLabel: string;
  occurredAt: string;
  href: string;
};

export type BuyerFinancialsSummary = {
  timeZone: string;
  day: string;
  monthLabel: string;
  lifetimeSpentUsd: number;
  monthSpentUsd: number;
  todaySpentUsd: number;
  marketplaceSpentUsd: number;
  liveSpentUsd: number;
  openBalanceUsd: number;
  pendingPaymentUsd: number;
  layawayRemainingUsd: number;
  referralCreditUsd: number;
  referralCreditPendingUsd: number;
  vaultCreditsUsd: number;
  paidOrderCount: number;
  activity: BuyerFinancialActivityRow[];
};

function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function sumInRange(
  rows: { amountUsd: number; at: Date }[],
  start: Date,
  end: Date,
): number {
  let total = 0;
  const a = start.getTime();
  const b = end.getTime();
  for (const row of rows) {
    const t = row.at.getTime();
    if (t >= a && t < b) total += row.amountUsd;
  }
  return money(total);
}

function monthBoundsUtc(day: string, timeZone: string): { start: Date; end: Date } {
  const [y, m] = day.split("-").map(Number);
  const start = zonedLocalToUtc(y, m, 1, 0, 0, 0, timeZone);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = zonedLocalToUtc(nextYear, nextMonth, 1, 0, 0, 0, timeZone);
  return { start, end };
}

function monthLabel(day: string, timeZone: string): string {
  try {
    const [y, m] = day.split("-").map(Number);
    const start = zonedLocalToUtc(y, m, 1, 12, 0, 0, timeZone);
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone });
  } catch {
    return day.slice(0, 7);
  }
}

export function resolveFinancialsTimeZone(tzParam: string | null): string {
  if (tzParam && isValidIanaTimeZone(tzParam)) return tzParam;
  return "America/Chicago";
}

/**
 * Buyer spend overview — paid marketplace/live charges, open balances, credits.
 * Live break/variant charges are included only when they do not already have a paid Order
 * (avoids double-counting fulfillment orders).
 */
export async function buildBuyerFinancialsSummary(
  userId: string,
  timeZone: string,
  now = new Date(),
): Promise<BuyerFinancialsSummary> {
  const day = calendarDayInTimeZone(now, timeZone);
  const { start: todayStart, end: todayEnd } = calendarDayBoundsUtc(day, timeZone);
  const { start: monthStart, end: monthEnd } = monthBoundsUtc(day, timeZone);

  const [orders, breakSpots, variantPurchases, layaways, referral, vaultCreditsUsd] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        totalUsd: true,
        paymentStatus: true,
        createdAt: true,
        liveShippingSessionId: true,
        listing: { select: { title: true } },
        seller: { select: { username: true } },
      },
    }),
    prisma.breakSpot.findMany({
      where: {
        userId,
        OR: [{ breakPaymentStatus: PAYMENT_PAID }, { breakPaymentStatus: "paid" }],
        fulfillmentOrderId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        priceUsd: true,
        spotLabel: true,
        paidAt: true,
        createdAt: true,
        liveRoom: { select: { id: true, title: true, seller: { select: { username: true } } } },
      },
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: {
        buyerId: userId,
        paymentStatus: "paid",
        fulfillmentOrderId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        totalUsd: true,
        paidAt: true,
        createdAt: true,
        revealedLabel: true,
        variant: { select: { label: true } },
        liveRoom: { select: { id: true, title: true, seller: { select: { username: true } } } },
      },
    }),
    prisma.layaway.findMany({
      where: {
        buyerId: userId,
        status: "active",
      },
      select: {
        id: true,
        remainingBalanceUsd: true,
        amountPaidUsd: true,
        listing: { select: { title: true } },
        updatedAt: true,
      },
      take: 100,
    }),
    getUserReferralSummary(userId),
    getAvailablePlatformCreditUsd(userId),
  ]);

  type SpendRow = {
    amountUsd: number;
    at: Date;
    channel: "marketplace" | "live";
    activity: BuyerFinancialActivityRow;
  };

  const spendRows: SpendRow[] = [];

  for (const o of orders) {
    if (o.paymentStatus !== PAYMENT_PAID) continue;
    const isLive = Boolean(o.liveShippingSessionId);
    const amountUsd = money(o.totalUsd);
    const at = o.createdAt;
    spendRows.push({
      amountUsd,
      at,
      channel: isLive ? "live" : "marketplace",
      activity: {
        id: `order:${o.id}`,
        title: o.listing?.title?.trim() || "Order",
        subtitle: `@${o.seller.username?.trim() || "seller"}${isLive ? " · Live" : " · Marketplace"}`,
        amountUsd,
        channel: isLive ? "live" : "marketplace",
        statusLabel: "Paid",
        occurredAt: at.toISOString(),
        href: `/orders/${encodeURIComponent(o.id)}`,
      },
    });
  }

  for (const s of breakSpots) {
    const amountUsd = money(s.priceUsd);
    const at = s.paidAt ?? s.createdAt;
    spendRows.push({
      amountUsd,
      at,
      channel: "live",
      activity: {
        id: `break_spot:${s.id}`,
        title: s.spotLabel?.trim() || "Break spot",
        subtitle: `${s.liveRoom.title?.trim() || "Live show"} · @${s.liveRoom.seller.username?.trim() || "seller"}`,
        amountUsd,
        channel: "live",
        statusLabel: "Paid",
        occurredAt: at.toISOString(),
        href: `/live/${encodeURIComponent(s.liveRoom.id)}`,
      },
    });
  }

  for (const vp of variantPurchases) {
    const amountUsd = money(vp.totalUsd);
    const at = vp.paidAt ?? vp.createdAt;
    const label = vp.revealedLabel?.trim() || vp.variant.label.trim() || "Live spot";
    spendRows.push({
      amountUsd,
      at,
      channel: "live",
      activity: {
        id: `variant:${vp.id}`,
        title: label,
        subtitle: `${vp.liveRoom.title?.trim() || "Live show"} · @${vp.liveRoom.seller.username?.trim() || "seller"}`,
        amountUsd,
        channel: "live",
        statusLabel: "Paid",
        occurredAt: at.toISOString(),
        href: `/live/${encodeURIComponent(vp.liveRoom.id)}`,
      },
    });
  }

  const lifetimeSpentUsd = money(spendRows.reduce((sum, r) => sum + r.amountUsd, 0));
  const monthSpentUsd = sumInRange(
    spendRows.map((r) => ({ amountUsd: r.amountUsd, at: r.at })),
    monthStart,
    monthEnd,
  );
  const todaySpentUsd = sumInRange(
    spendRows.map((r) => ({ amountUsd: r.amountUsd, at: r.at })),
    todayStart,
    todayEnd,
  );
  const marketplaceSpentUsd = money(
    spendRows.filter((r) => r.channel === "marketplace").reduce((sum, r) => sum + r.amountUsd, 0),
  );
  const liveSpentUsd = money(
    spendRows.filter((r) => r.channel === "live").reduce((sum, r) => sum + r.amountUsd, 0),
  );

  const [pendingOrders, unpaidBreakSpots, unpaidVariants] = await Promise.all([
    prisma.order.findMany({
      where: {
        buyerId: userId,
        paymentStatus: { in: [PAYMENT_PENDING, PAYMENT_REQUIRES_ACTION, PAYMENT_FAILED] },
      },
      select: { totalUsd: true },
      take: 200,
    }),
    prisma.breakSpot.findMany({
      where: {
        userId,
        breakPaymentStatus: { in: ["unpaid", "pending_payment", PAYMENT_PENDING, PAYMENT_FAILED] },
      },
      select: { priceUsd: true },
      take: 200,
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: {
        buyerId: userId,
        paymentStatus: { in: ["pending_payment", "failed"] },
      },
      select: { totalUsd: true },
      take: 200,
    }),
  ]);

  const pendingPaymentUsd = money(
    pendingOrders.reduce((s, o) => s + o.totalUsd, 0) +
      unpaidBreakSpots.reduce((s, o) => s + o.priceUsd, 0) +
      unpaidVariants.reduce((s, o) => s + o.totalUsd, 0),
  );

  const layawayRemainingUsd = money(layaways.reduce((s, l) => s + l.remainingBalanceUsd, 0));
  const openBalanceUsd = money(pendingPaymentUsd + layawayRemainingUsd);

  const activity = spendRows
    .map((r) => r.activity)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 40);

  for (const l of layaways) {
    if (l.remainingBalanceUsd <= 0) continue;
    activity.push({
      id: `layaway:${l.id}`,
      title: l.listing.title?.trim() || "Layaway",
      subtitle: "Remaining balance due",
      amountUsd: money(l.remainingBalanceUsd),
      channel: "layaway",
      statusLabel: "Balance due",
      occurredAt: l.updatedAt.toISOString(),
      href: `/account/layaways/${encodeURIComponent(l.id)}`,
    });
  }

  activity.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    timeZone,
    day,
    monthLabel: monthLabel(day, timeZone),
    lifetimeSpentUsd,
    monthSpentUsd,
    todaySpentUsd,
    marketplaceSpentUsd,
    liveSpentUsd,
    openBalanceUsd,
    pendingPaymentUsd,
    layawayRemainingUsd,
    referralCreditUsd: money(referral.availableUsd),
    referralCreditPendingUsd: money(referral.pendingUsd),
    vaultCreditsUsd: money(vaultCreditsUsd),
    paidOrderCount: spendRows.length,
    activity: activity.slice(0, 50),
  };
}
