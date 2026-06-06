import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { buyerHasActiveLayaway } from "@/lib/layaway/eligibility";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await prisma.layaway.findFirst({
    where: { buyerId: session.user.id, status: "active" },
    select: { id: true, listingId: true, dueAt: true, remainingBalanceUsd: true },
  });

  return NextResponse.json({
    hasActiveLayaway: await buyerHasActiveLayaway(session.user.id),
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
