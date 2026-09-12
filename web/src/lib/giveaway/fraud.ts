import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmailForComparison } from "@/lib/identity-normalize";
import { isDisposableEmailDomain, looksLikeTestAccountEmail } from "@/lib/giveaway/disposable-email";

export type GiveawayFraudReason =
  | "duplicate_email"
  | "disposable_email"
  | "self_referral"
  | "test_account"
  | "admin_account"
  | "suspended_account"
  | "signup_velocity";

/** Flag suspicious activity — never auto-blocks entries. */
export async function flagGiveawayFraud(args: {
  campaignId: string | null;
  userId: string;
  reason: GiveawayFraudReason;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.giveawayFraudFlag.create({
      data: {
        campaignId: args.campaignId,
        userId: args.userId,
        reason: args.reason,
        detail: (args.detail ?? "").slice(0, 2000),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    console.warn("[giveaway-fraud] flag failed", e);
  }
}

export async function evaluateAndFlagGiveawayUser(args: {
  campaignId: string;
  userId: string;
}): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      id: true,
      email: true,
      role: true,
      suspendedAt: true,
      referredById: true,
      createdAt: true,
    },
  });
  if (!user) return [];

  const flagged: string[] = [];

  if (user.role === "admin") {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "admin_account",
      detail: "Admin accounts are not eligible",
    });
    flagged.push("admin_account");
  }
  if (user.suspendedAt) {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "suspended_account",
    });
    flagged.push("suspended_account");
  }
  if (looksLikeTestAccountEmail(user.email)) {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "test_account",
      detail: user.email,
    });
    flagged.push("test_account");
  }
  if (isDisposableEmailDomain(user.email)) {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "disposable_email",
      detail: user.email,
    });
    flagged.push("disposable_email");
  }

  const norm = normalizeEmailForComparison(user.email);
  const others = await prisma.user.findMany({
    where: { id: { not: user.id }, email: { contains: "@" } },
    select: { id: true, email: true },
    take: 5000,
  });
  const dup = others.find((o) => normalizeEmailForComparison(o.email) === norm);
  if (dup) {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "duplicate_email",
      detail: `matches user ${dup.id}`,
    });
    flagged.push("duplicate_email");
  }

  if (user.referredById) {
    const referrer = await prisma.user.findUnique({
      where: { id: user.referredById },
      select: { id: true, email: true },
    });
    if (referrer && normalizeEmailForComparison(referrer.email) === norm) {
      await flagGiveawayFraud({
        campaignId: args.campaignId,
        userId: user.id,
        reason: "self_referral",
        detail: `referrer ${referrer.id}`,
      });
      flagged.push("self_referral");
    }
  }

  // Signup velocity: many accounts created in last hour with similar email local-part
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.user.count({
    where: { createdAt: { gte: hourAgo } },
  });
  if (recent >= 40) {
    await flagGiveawayFraud({
      campaignId: args.campaignId,
      userId: user.id,
      reason: "signup_velocity",
      detail: `${recent} signups in last hour`,
    });
    flagged.push("signup_velocity");
  }

  return flagged;
}
