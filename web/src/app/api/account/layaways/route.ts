import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processLayawayMaintenance } from "@/services/layaway";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await processLayawayMaintenance();
  } catch (e) {
    console.error("[layaways] maintenance", e);
  }

  const rows = await prisma.layaway.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
    },
  });

  return NextResponse.json({
    layaways: rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      listingTitle: r.listing.title,
      listingImageUrl: r.listing.images[0]?.url ?? null,
      planType: r.planType,
      status: r.status,
      originalPriceUsd: r.originalPriceUsd,
      depositAmountUsd: r.depositAmountUsd,
      amountPaidUsd: r.amountPaidUsd,
      remainingBalanceUsd: r.remainingBalanceUsd,
      startedAt: r.startedAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      orderId: r.orderId,
    })),
  });
}
