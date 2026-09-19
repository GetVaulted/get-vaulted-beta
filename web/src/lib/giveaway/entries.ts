import { Prisma } from "@/generated/prisma/client";
import {
  GiveawayCampaignStatus,
  GiveawayEntryType,
  UserRole,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { evaluateAndFlagGiveawayUser } from "@/lib/giveaway/fraud";
import { looksLikeTestAccountEmail } from "@/lib/giveaway/disposable-email";

export type GiveawayEligibleUser = {
  id: string;
  email: string;
  emailVerified: Date | null;
  role: UserRole;
  suspendedAt: Date | null;
  accountDeletedAt: Date | null;
  createdAt: Date;
  referredById: string | null;
};

export function isGiveawayEligibleUser(user: GiveawayEligibleUser): boolean {
  if (!user.emailVerified) return false;
  if (user.suspendedAt) return false;
  if (user.accountDeletedAt) return false;
  if (user.role === UserRole.admin) return false;
  if (looksLikeTestAccountEmail(user.email)) return false;
  return true;
}

export async function getActiveGiveawayCampaigns(now = new Date()) {
  return prisma.giveawayCampaign.findMany({
    where: {
      status: GiveawayCampaignStatus.active,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
  });
}

async function insertLedgerEntry(args: {
  campaignId: string;
  userId: string;
  entryType: GiveawayEntryType;
  quantity: number;
  source: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  notify?: "entered" | "existing";
}): Promise<{ created: boolean; id?: string }> {
  try {
    const row = await prisma.giveawayEntryLedger.create({
      data: {
        campaignId: args.campaignId,
        userId: args.userId,
        entryType: args.entryType,
        quantity: args.quantity,
        source: args.source,
        idempotencyKey: args.idempotencyKey,
        metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    if (args.notify === "entered") {
      await createNotification(prisma, {
        userId: args.userId,
        type: "giveaway_entry",
        title: "You're Entered! 🎉",
        body: "You received an entry into the $500 Get Vaulted Credit Giveaway.",
        href: "/giveaway",
      });
    } else if (args.notify === "existing") {
      await createNotification(prisma, {
        userId: args.userId,
        type: "giveaway_entry_existing",
        title: "You're Entered! 🎉",
        body: "Thanks for being an early Get Vaulted member! We've automatically entered you into our $500 Get Vaulted Credit Giveaway.",
        href: "/giveaway",
      });
    }
    return { created: true, id: row.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { created: false };
    }
    throw e;
  }
}

/**
 * After email verification (or Supabase sync): grant new_signup and/or referral entries
 * for every active campaign.
 */
export async function onUserEmailVerifiedForGiveaways(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  });
  if (!user || !isGiveawayEligibleUser(user)) return;

  const campaigns = await getActiveGiveawayCampaigns();
  for (const campaign of campaigns) {
    await evaluateAndFlagGiveawayUser({ campaignId: campaign.id, userId: user.id });

    const createdDuring = user.createdAt >= campaign.startsAt && user.createdAt <= campaign.endsAt;
    if (createdDuring) {
      await insertLedgerEntry({
        campaignId: campaign.id,
        userId: user.id,
        entryType: GiveawayEntryType.new_signup,
        quantity: 1,
        source: "email_verified",
        idempotencyKey: `${campaign.id}:new_signup:${user.id}`,
        notify: "entered",
      });
    }

    if (user.referredById) {
      const referrer = await prisma.user.findUnique({
        where: { id: user.referredById },
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
      });
      if (referrer && isGiveawayEligibleUser(referrer) && referrer.id !== user.id) {
        await evaluateAndFlagGiveawayUser({ campaignId: campaign.id, userId: referrer.id });
        await insertLedgerEntry({
          campaignId: campaign.id,
          userId: referrer.id,
          entryType: GiveawayEntryType.referral,
          quantity: 1,
          source: `referral:${user.id}`,
          idempotencyKey: `${campaign.id}:referral:${referrer.id}:${user.id}`,
          metadata: { refereeUserId: user.id },
          notify: "entered",
        });
      }
    }
  }
}

/** Backfill one existing_user entry for every eligible verified user (batched). */
export async function backfillExistingUserEntries(args: {
  campaignId: string;
  batchSize?: number;
}): Promise<{ scanned: number; created: number }> {
  const campaign = await prisma.giveawayCampaign.findUnique({ where: { id: args.campaignId } });
  if (!campaign) return { scanned: 0, created: 0 };

  const batchSize = Math.min(500, Math.max(50, args.batchSize ?? 200));
  let cursor: string | undefined;
  let scanned = 0;
  let created = 0;

  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        emailVerified: { not: null },
        suspendedAt: null,
        accountDeletedAt: null,
        role: UserRole.user,
        createdAt: { lt: campaign.startsAt },
      },
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
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;
      cursor = user.id;
      if (!isGiveawayEligibleUser(user)) continue;
      await evaluateAndFlagGiveawayUser({ campaignId: campaign.id, userId: user.id });
      const result = await insertLedgerEntry({
        campaignId: campaign.id,
        userId: user.id,
        entryType: GiveawayEntryType.existing_user,
        quantity: 1,
        source: "backfill",
        idempotencyKey: `${campaign.id}:existing_user:${user.id}`,
        notify: "existing",
      });
      if (result.created) created += 1;
    }

    if (users.length < batchSize) break;
  }

  return { scanned, created };
}

export async function adminManualGiveawayEntry(args: {
  campaignId: string;
  userId: string;
  quantity: number;
  adminUserId: string;
  idempotencyKey: string;
  note?: string;
}): Promise<{ created: boolean }> {
  return insertLedgerEntry({
    campaignId: args.campaignId,
    userId: args.userId,
    entryType: GiveawayEntryType.manual_adjustment,
    quantity: args.quantity,
    source: `admin:${args.adminUserId}`,
    idempotencyKey: args.idempotencyKey,
    metadata: { note: args.note ?? null },
    notify: args.quantity > 0 ? "entered" : undefined,
  });
}

export async function getUserGiveawayEntrySummary(campaignId: string, userId: string) {
  const rows = await prisma.giveawayEntryLedger.findMany({
    where: { campaignId, userId },
    orderBy: { createdAt: "asc" },
  });
  const totalEntries = rows.reduce((s, r) => s + r.quantity, 0);
  const referralEntries = rows
    .filter((r) => r.entryType === GiveawayEntryType.referral)
    .reduce((s, r) => s + r.quantity, 0);
  const purchaseEntries = rows
    .filter((r) => r.entryType === GiveawayEntryType.purchase)
    .reduce((s, r) => s + r.quantity, 0);
  return { totalEntries, referralEntries, purchaseEntries, history: rows };
}

export async function getCampaignEntryStats(campaignId: string) {
  const grouped = await prisma.giveawayEntryLedger.groupBy({
    by: ["userId"],
    where: { campaignId },
    _sum: { quantity: true },
  });
  const totalEntrants = grouped.length;
  const totalEntries = grouped.reduce((s, g) => s + (g._sum.quantity ?? 0), 0);
  return { totalEntries, totalEntrants };
}
