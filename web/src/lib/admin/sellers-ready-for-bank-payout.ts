import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  listOrdersReadyForAdminBankPayout,
  type AdminBankPayoutReadyRow,
} from "@/lib/admin/orders-ready-for-bank-payout";
import { bankPayoutPushableUsd } from "@/lib/admin/bank-payout-pushable";

export type AdminBankPayoutSellerOrder = {
  orderId: string;
  itemTitle: string;
  estimatedNetUsd: number;
  shippedAt: string | null;
  payoutStatus: string;
};

export type AdminBankPayoutSellerRow = {
  sellerId: string;
  username: string | null;
  email: string | null;
  stripeAccountId: string | null;
  orderCount: number;
  owedUsd: number;
  availableUsd: number | null;
  pendingUsd: number | null;
  pushableUsd: number;
  blockedReason: string | null;
  orders: AdminBankPayoutSellerOrder[];
};

function usdFromStripeBalanceAmounts(
  buckets: Array<{ amount: number; currency: string }> | undefined,
): number {
  if (!buckets?.length) return 0;
  return buckets.filter((b) => b.currency === "usd").reduce((sum, b) => sum + b.amount, 0) / 100;
}

function groupReadyOrdersBySeller(orders: AdminBankPayoutReadyRow[]) {
  const map = new Map<
    string,
    {
      sellerId: string;
      username: string | null;
      email: string | null;
      orders: AdminBankPayoutReadyRow[];
      owedUsd: number;
    }
  >();
  for (const o of orders) {
    const cur = map.get(o.sellerId);
    if (!cur) {
      map.set(o.sellerId, {
        sellerId: o.sellerId,
        username: o.sellerUsername,
        email: o.sellerEmail,
        orders: [o],
        owedUsd: o.estimatedNetUsd,
      });
    } else {
      cur.orders.push(o);
      cur.owedUsd += o.estimatedNetUsd;
    }
  }
  return [...map.values()];
}

/**
 * Seller-centric ready queue: owed (ready nets) vs live Connect available.
 * Pushable = min(owed, available) so admins cannot overpay.
 */
export async function listSellersReadyForAdminBankPayout(limitOrders = 500): Promise<{
  sellers: AdminBankPayoutSellerRow[];
  sellerCount: number;
  orderCount: number;
}> {
  const orders = await listOrdersReadyForAdminBankPayout(Math.min(1000, Math.max(1, limitOrders)));
  const groups = groupReadyOrdersBySeller(orders);

  const sellerIds = groups.map((g) => g.sellerId);
  const users =
    sellerIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: {
            id: true,
            stripeAccountId: true,
            stripeOnboardingComplete: true,
            stripePayoutsEnabled: true,
          },
        });
  const userById = new Map(users.map((u) => [u.id, u]));

  const stripe = isStripeConfigured() ? getStripe() : null;
  const sellers: AdminBankPayoutSellerRow[] = [];

  for (const g of groups) {
    const user = userById.get(g.sellerId);
    const accountId = user?.stripeAccountId?.trim() || null;
    let availableUsd: number | null = null;
    let pendingUsd: number | null = null;
    let blockedReason: string | null = null;

    if (!accountId) {
      blockedReason = "no_stripe_account";
    } else if (!user?.stripeOnboardingComplete) {
      blockedReason = "stripe_onboarding_incomplete";
    } else if (!stripe) {
      blockedReason = "stripe_not_configured";
    } else {
      try {
        const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
        availableUsd = usdFromStripeBalanceAmounts(balance.available);
        pendingUsd = usdFromStripeBalanceAmounts(balance.pending);
        if (user.stripePayoutsEnabled === false) {
          blockedReason = "stripe_payouts_disabled";
        }
      } catch (e) {
        blockedReason = `stripe_balance_error:${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`;
        availableUsd = null;
        pendingUsd = null;
      }
    }

    const owedUsd = Math.round(g.owedUsd * 100) / 100;
    const pushableUsd =
      availableUsd == null || blockedReason === "stripe_payouts_disabled"
        ? 0
        : Math.round(bankPayoutPushableUsd(owedUsd, availableUsd) * 100) / 100;

    // Oldest first for FIFO display / push
    const sortedOrders = [...g.orders].sort((a, b) => {
      const aT = a.shippedAt ? Date.parse(a.shippedAt) : Date.parse(a.createdAt);
      const bT = b.shippedAt ? Date.parse(b.shippedAt) : Date.parse(b.createdAt);
      if (aT !== bT) return aT - bT;
      return a.orderId.localeCompare(b.orderId);
    });

    sellers.push({
      sellerId: g.sellerId,
      username: g.username,
      email: g.email,
      stripeAccountId: accountId,
      orderCount: sortedOrders.length,
      owedUsd,
      availableUsd,
      pendingUsd,
      pushableUsd,
      blockedReason,
      orders: sortedOrders.map((o) => ({
        orderId: o.orderId,
        itemTitle: o.itemTitle,
        estimatedNetUsd: o.estimatedNetUsd,
        shippedAt: o.shippedAt,
        payoutStatus: o.payoutStatus,
      })),
    });
  }

  sellers.sort((a, b) => b.pushableUsd - a.pushableUsd || b.owedUsd - a.owedUsd);

  return {
    sellers,
    sellerCount: sellers.length,
    orderCount: orders.length,
  };
}
