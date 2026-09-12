import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { buyerHasActiveLayaway } from "@/lib/layaway/eligibility";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const active = await prisma.layaway.findFirst({
    where: { buyerId: auth.userId, status: "active" },
    select: { id: true, listingId: true, dueAt: true, remainingBalanceUsd: true },
  });

  return NextResponse.json({
    hasActiveLayaway: await buyerHasActiveLayaway(auth.userId),
    activeLayaway: active
      ? {
          id: active.id,
          listingId: active.listingId,
          dueAt: active.dueAt.toISOString(),
          remainingBalanceUsd: active.remainingBalanceUsd,
        }
      : null,
  });
}
