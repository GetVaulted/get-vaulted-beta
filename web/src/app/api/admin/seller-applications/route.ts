import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { isSellerApplicationsEnforced } from "@/lib/seller-approval";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "info_requested", "approved", "rejected", "revoked"] as const;

/** GET — applications for the admin queue. ?status=pending|info_requested|approved|rejected|revoked|all, ?grandfathered=1, ?q= */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sp = new URL(req.url).searchParams;
  const status = (sp.get("status") ?? "pending").trim();
  const q = (sp.get("q") ?? "").trim();
  const grandfatheredOnly = sp.get("grandfathered") === "1";

  const where: Prisma.SellerApplicationWhereInput = {};
  if ((STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (grandfatheredOnly) where.grandfathered = true;
  if (q) {
    where.user = {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const [rows, counts] = await Promise.all([
    prisma.sellerApplication.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }],
      take: 300,
      select: {
        id: true,
        status: true,
        whatTheySell: true,
        whereTheySellNow: true,
        experience: true,
        monthlyVolume: true,
        adminNote: true,
        reviewedAt: true,
        grandfathered: true,
        submittedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            createdAt: true,
            suspendedAt: true,
            stripeOnboardingComplete: true,
            _count: { select: { listings: true, liveRooms: true } },
          },
        },
      },
    }),
    prisma.sellerApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;

  return NextResponse.json({
    enforced: isSellerApplicationsEnforced(),
    counts: countByStatus,
    applications: rows.map((r) => ({
      id: r.id,
      status: r.status,
      whatTheySell: r.whatTheySell,
      whereTheySellNow: r.whereTheySellNow,
      experience: r.experience,
      monthlyVolume: r.monthlyVolume,
      adminNote: r.adminNote,
      grandfathered: r.grandfathered,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      user: {
        id: r.user.id,
        username: r.user.username,
        email: r.user.email,
        name: r.user.name,
        joinedAt: r.user.createdAt.toISOString(),
        suspended: Boolean(r.user.suspendedAt),
        stripeReady: r.user.stripeOnboardingComplete,
        listingCount: r.user._count.listings,
        liveShowCount: r.user._count.liveRooms,
      },
    })),
  });
}
