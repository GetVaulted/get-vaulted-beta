import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { serializeBuyerLayawayRow } from "@/lib/layaway/serialize-buyer-layaway";
import { prisma } from "@/lib/prisma";
import { processLayawayMaintenance } from "@/services/layaway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const layawayId = id?.trim();
  if (!layawayId) return NextResponse.json({ error: "Layaway id required." }, { status: 400 });

  try {
    await processLayawayMaintenance();
  } catch (e) {
    console.error("[layaways/detail] maintenance", e);
  }

  const row = await prisma.layaway.findFirst({
    where: { id: layawayId, buyerId: auth.userId },
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
