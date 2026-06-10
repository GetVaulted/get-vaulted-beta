import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { serializeBuyerLayawayRow } from "@/lib/layaway/serialize-buyer-layaway";
import { prisma } from "@/lib/prisma";
import { processLayawayMaintenance } from "@/services/layaway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const layawayId = id?.trim();
  if (!layawayId) return NextResponse.json({ error: "Layaway id required." }, { status: 400 });

  try {
    await processLayawayMaintenance();
  } catch (e) {
    console.error("[layaways/detail] maintenance", e);
  }

  const row = await prisma.layaway.findFirst({
    where: { id: layawayId, buyerId: session.user.id },
    include: {
      listing: { select: { id: true, title: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
      order: { select: { paymentStatus: true } },
    },
  });

  if (!row) return NextResponse.json({ error: "Layaway not found." }, { status: 404 });

  const layaway = serializeBuyerLayawayRow(row);
  console.info("[layaways/detail] buyer layaway", {
    layawayId,
    status: layaway.status,
    orderPaymentStatus: layaway.orderPaymentStatus,
    amountPaidUsd: layaway.amountPaidUsd,
    depositAmountUsd: layaway.depositAmountUsd,
    remainingBalanceUsd: layaway.remainingBalanceUsd,
    displayStatus: layaway.displayStatus,
    canMakePayment: layaway.canMakePayment,
  });

  return NextResponse.json({ layaway });
}
