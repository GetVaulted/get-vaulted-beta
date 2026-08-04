import { Prisma } from "@/generated/prisma/client";
import {
  GiveawayDrawStatus,
  GiveawayEntryType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { looksLikeTestAccountEmail } from "@/lib/giveaway/disposable-email";
import {
  getActiveGiveawayCampaigns,
  isGiveawayEligibleUser,
} from "@/lib/giveaway/entries";
import { evaluateAndFlagGiveawayUser } from "@/lib/giveaway/fraud";
import { orderItemSaleBasisUsd } from "@/lib/referral-credit-payout";
import { PAYMENT_PAID } from "@/services/payments";

/** Every full $10 of eligible spend → 1 entry. */
export function purchaseEntriesFromAmountUsd(eligiblePurchaseAmountUsd: number): number {
  if (!Number.isFinite(eligiblePurchaseAmountUsd) || eligiblePurchaseAmountUsd < 0) return 0;
  return Math.floor(eligiblePurchaseAmountUsd / 10);
}

/** Merchandise sale basis (item before store-credit discounts). Tax/shipping do not count. */
export function eligiblePurchaseAmountFromOrder(order: {
  itemPriceUsd: number;
  referralCreditAppliedUsd?: number | null;
  platformCreditAppliedUsd?: number | null;
}): number {
  return Math.round(orderItemSaleBasisUsd(order) * 100) / 100;
}

export function purchaseEntryIdempotencyKey(campaignId: string, orderId: string): string {
  return `purchase:${campaignId}:${orderId}`;
}

export function purchaseClawbackIdempotencyKey(campaignId: string, orderId: string): string {
  return `purchase:${campaignId}:${orderId}:clawback`;
}

/**
 * Award purchase bonus entries for every active giveaway when an order reaches PAID.
 * Idempotent per (campaign, order). Best-effort — never throws to callers.
 */
export async function onOrderPaidForGiveaways(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      paymentStatus: true,
      itemPriceUsd: true,
      referralCreditAppliedUsd: true,
      platformCreditAppliedUsd: true,
      buyer: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          role: true,
          suspendedAt: true,
          accountDeletedAt: true,
          createdAt: true,
          referredById: true,
        },
      },
    },
  });
  if (!order || order.paymentStatus !== PAYMENT_PAID) return;
  if (!order.buyer || !isGiveawayEligibleUser(order.buyer)) return;
  if (looksLikeTestAccountEmail(order.buyer.email)) return;

  const eligibleAmount = eligiblePurchaseAmountFromOrder(order);
  const quantity = purchaseEntriesFromAmountUsd(eligibleAmount);
  if (quantity <= 0) return;

  const campaigns = await getActiveGiveawayCampaigns();
  for (const campaign of campaigns) {
    await evaluateAndFlagGiveawayUser({ campaignId: campaign.id, userId: order.buyerId }).catch(
      () => undefined,
    );

    try {
      await prisma.giveawayEntryLedger.create({
        data: {
          campaignId: campaign.id,
          userId: order.buyerId,
          entryType: GiveawayEntryType.purchase,
          quantity,
          source: purchaseEntryIdempotencyKey(campaign.id, order.id),
          idempotencyKey: purchaseEntryIdempotencyKey(campaign.id, order.id),
          metadata: {
            orderId: order.id,
            eligibleAmountUsd: eligibleAmount,
            entriesPerTenUsd: 1,
          } as Prisma.InputJsonValue,
        },
      });
      await createNotification(prisma, {
        userId: order.buyerId,
        type: "giveaway_purchase_entries",
        title: "Bonus giveaway entries!",
        body:
          quantity === 1
            ? `Your purchase earned 1 bonus entry into the giveaway.`
            : `Your purchase earned ${quantity} bonus entries into the giveaway.`,
        href: "/giveaway",
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue; // already awarded for this order/campaign
      }
      console.error("[giveaway] purchase entry award failed", { orderId, campaignId: campaign.id, e });
    }
  }
}

/**
 * After a full refund or chargeback: remove purchase entries from the drawing pool
 * via a negative ledger row (original grant preserved for audit). Idempotent.
 * Skipped once a campaign winner is confirmed (draw already used the prior pool).
 */
export async function clawbackPurchaseEntriesForOrder(orderId: string): Promise<void> {
  const grants = await prisma.giveawayEntryLedger.findMany({
    where: {
      entryType: GiveawayEntryType.purchase,
      quantity: { gt: 0 },
      idempotencyKey: { endsWith: `:${orderId}` },
    },
  });

  for (const grant of grants) {
    if (grant.idempotencyKey !== purchaseEntryIdempotencyKey(grant.campaignId, orderId)) continue;

    const campaign = await prisma.giveawayCampaign.findUnique({
      where: { id: grant.campaignId },
      select: { winnerConfirmedAt: true },
    });
    if (!campaign || campaign.winnerConfirmedAt) continue;

    const confirmedDraw = await prisma.giveawayDraw.findFirst({
      where: { campaignId: grant.campaignId, status: GiveawayDrawStatus.confirmed },
      select: { id: true },
    });
    if (confirmedDraw) continue;

    try {
      await prisma.giveawayEntryLedger.create({
        data: {
          campaignId: grant.campaignId,
          userId: grant.userId,
          entryType: GiveawayEntryType.purchase,
          quantity: -grant.quantity,
          source: `purchase_clawback:${orderId}`,
          idempotencyKey: purchaseClawbackIdempotencyKey(grant.campaignId, orderId),
          metadata: {
            orderId,
            clawbackOfEntryId: grant.id,
            reason: "full_refund_or_chargeback",
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      console.error("[giveaway] purchase entry clawback failed", {
        orderId,
        campaignId: grant.campaignId,
        e,
      });
    }
  }
}

export type CampaignEntryBreakdown = {
  existing_user: number;
  new_signup: number;
  referral: number;
  purchase: number;
  manual_adjustment: number;
};

export async function getCampaignAdminAnalytics(campaignId: string) {
  const [byUser, byType, purchaseGrants, fraudCount] = await Promise.all([
    prisma.giveawayEntryLedger.groupBy({
      by: ["userId"],
      where: { campaignId },
      _sum: { quantity: true },
    }),
    prisma.giveawayEntryLedger.groupBy({
      by: ["entryType"],
      where: { campaignId },
      _sum: { quantity: true },
    }),
    prisma.giveawayEntryLedger.findMany({
      where: {
        campaignId,
        entryType: GiveawayEntryType.purchase,
        quantity: { gt: 0 },
      },
      select: { quantity: true, metadata: true, userId: true },
    }),
    prisma.giveawayFraudFlag.count({ where: { campaignId } }),
  ]);

  const totalEntries = byUser.reduce((s, g) => s + (g._sum.quantity ?? 0), 0);
  const totalEntrants = byUser.filter((g) => (g._sum.quantity ?? 0) > 0).length;
  const avgEntriesPerUser =
    totalEntrants > 0 ? Math.round((totalEntries / totalEntrants) * 100) / 100 : 0;

  const breakdown: CampaignEntryBreakdown = {
    existing_user: 0,
    new_signup: 0,
    referral: 0,
    purchase: 0,
    manual_adjustment: 0,
  };
  for (const row of byType) {
    const key = row.entryType as keyof CampaignEntryBreakdown;
    if (key in breakdown) breakdown[key] = row._sum.quantity ?? 0;
  }

  const purchaseEntries = breakdown.purchase;
  let purchaseRevenue = 0;
  for (const g of purchaseGrants) {
    const meta = g.metadata as { eligibleAmountUsd?: number } | null;
    const amt = Number(meta?.eligibleAmountUsd ?? 0);
    if (Number.isFinite(amt) && amt > 0) purchaseRevenue += amt;
  }
  purchaseRevenue = Math.round(purchaseRevenue * 100) / 100;

  const topUserIds = [...byUser]
    .filter((g) => (g._sum.quantity ?? 0) > 0)
    .sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0))
    .slice(0, 10);

  const users =
    topUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: topUserIds.map((t) => t.userId) } },
          select: { id: true, username: true, email: true },
        });
  const userById = new Map(users.map((u) => [u.id, u]));
  const topEntrants = topUserIds.map((t) => {
    const u = userById.get(t.userId);
    return {
      userId: t.userId,
      username: u?.username ?? null,
      email: u?.email ?? null,
      totalEntries: t._sum.quantity ?? 0,
    };
  });

  return {
    totalEntries,
    totalEntrants,
    avgEntriesPerUser,
    purchaseEntries,
    purchaseRevenue,
    breakdown,
    topEntrants,
    fraudCount,
  };
}
