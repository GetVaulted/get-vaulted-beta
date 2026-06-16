import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const segment = (new URL(req.url).searchParams.get("segment") ?? "all").trim();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const where: Prisma.UserWhereInput = {};
  if (q.length > 0) {
    where.OR = [{ email: { contains: q } }, { username: { contains: q } }];
  }

  if (segment === "admin") {
    where.role = "admin";
  } else if (segment === "suspended") {
    where.suspendedAt = { not: null };
  } else if (segment === "sellers") {
    where.sellerSetupWizardCompletedAt = { not: null };
  } else if (segment === "buyers") {
    where.orders = { some: {} };
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspendedAt: true,
      emailVerified: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
      stripeVerificationStatus: true,
      sellerSetupWizardCompletedAt: true,
      createdAt: true,
      _count: { select: { listings: true, orders: true, sales: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  const counts = await Promise.all([
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { sellerSetupWizardCompletedAt: { not: null } } }),
    prisma.user.count({ where: { orders: { some: {} } } }),
  ]);

  return NextResponse.json({
    counts: {
      admins: counts[0],
      suspended: counts[1],
      sellers: counts[2],
      buyers: counts[3],
    },
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      emailVerified: u.emailVerified?.toISOString() ?? null,
      stripeConnect: {
        accountId: u.stripeAccountId,
        onboardingComplete: u.stripeOnboardingComplete,
        payoutsEnabled: u.stripePayoutsEnabled,
        verificationStatus: u.stripeVerificationStatus,
      },
      sellerOnboardingComplete: u.sellerSetupWizardCompletedAt?.toISOString() ?? null,
      listingCount: u._count.listings,
      buyerOrderCount: u._count.orders,
      sellerOrderCount: u._count.sales,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}
