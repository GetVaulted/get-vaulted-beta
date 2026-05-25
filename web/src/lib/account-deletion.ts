import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { revokeSupabaseAuthUser } from "@/lib/supabase-admin";

export type AccountDeletionBlocker = {
  code: string;
  message: string;
};

const OPEN_ORDER_STATUSES = new Set(["pending", "paid", "processing"]);
const OPEN_FULFILLMENT = new Set(["pending", "processing", "label_purchased"]);

export async function getAccountDeletionBlockers(userId: string): Promise<AccountDeletionBlocker[]> {
  const blockers: AccountDeletionBlocker[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountDeletedAt: true, stripePayoutsEnabled: true, stripeAccountId: true },
  });
  if (user?.accountDeletedAt) {
    blockers.push({ code: "already_deleted", message: "This account is already deleted." });
    return blockers;
  }

  const [openBuyerOrders, openSellerOrders, liveRoom, openReports] = await Promise.all([
    prisma.order.count({
      where: {
        buyerId: userId,
        OR: [{ status: { in: [...OPEN_ORDER_STATUSES] } }, { fulfillmentStatus: { in: [...OPEN_FULFILLMENT] } }],
      },
    }),
    prisma.order.count({
      where: {
        sellerId: userId,
        OR: [{ status: { in: [...OPEN_ORDER_STATUSES] } }, { fulfillmentStatus: { in: [...OPEN_FULFILLMENT] } }],
      },
    }),
    prisma.liveRoom.count({ where: { sellerId: userId, status: "live" } }),
    prisma.report.count({
      where: {
        reporterUserId: userId,
        status: { in: ["open", "reviewing"] },
      },
    }),
  ]);

  if (openBuyerOrders > 0) {
    blockers.push({
      code: "open_buyer_orders",
      message: "You have open purchases. Complete or resolve them before deleting your account.",
    });
  }
  if (openSellerOrders > 0) {
    blockers.push({
      code: "open_seller_orders",
      message: "You have open sales to fulfill. Finish fulfillment before deleting your account.",
    });
  }
  if (liveRoom > 0) {
    blockers.push({
      code: "live_show_active",
      message: "End your live show before deleting your account.",
    });
  }
  if (openReports > 0) {
    blockers.push({
      code: "open_reports",
      message: "You have reports under review. Wait for moderation to finish before deleting.",
    });
  }

  if (user?.stripeAccountId && user.stripePayoutsEnabled) {
    blockers.push({
      code: "stripe_payouts_active",
      message: "Withdraw or resolve pending Stripe payouts before deleting your seller account.",
    });
  }

  return blockers;
}

function deletedEmail(userId: string): string {
  return `deleted+${userId}@deleted.getvaulted.internal`;
}

function deletedUsername(userId: string): string {
  const stem = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `deleted_${stem}`.slice(0, 20);
}

export async function deleteUserAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const blockers = await getAccountDeletionBlockers(userId);
  if (blockers.length > 0) {
    return { ok: false, error: blockers.map((b) => b.message).join(" ") };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountDeletedAt: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (user.accountDeletedAt) return { ok: false, error: "Account already deleted." };

  const now = new Date();
  const email = deletedEmail(userId);
  const username = deletedUsername(userId);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        accountDeletedAt: now,
        email,
        username,
        name: "Deleted User",
        image: null,
        passwordHash: null,
        stripeCustomerId: null,
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripeChargesEnabled: null,
        stripePayoutsEnabled: null,
        stripeRequirementsDue: Prisma.DbNull,
        stripeVerificationStatus: null,
        shipFromName: null,
        shipFromStreet: null,
        shipFromCity: null,
        shipFromState: null,
        shipFromZip: null,
        shipFromCountry: null,
        suspendedAt: now,
      },
    });

    await tx.listing.updateMany({
      where: { sellerId: userId, status: { in: ["active", "draft"] } },
      data: { status: "ended" },
    });

    await tx.notification.updateMany({
      where: { userId },
      data: { readAt: now },
    });
  });

  const authResult = await revokeSupabaseAuthUser(userId);
  if (!authResult.ok) {
    console.warn("[deleteUserAccount] Supabase auth revoke failed", { userId, error: authResult.error });
  }

  return { ok: true };
}

export function isAccountDeleted(user: { accountDeletedAt?: Date | null; suspendedAt?: Date | null }): boolean {
  return Boolean(user.accountDeletedAt);
}
