import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPayPalSellerPayoutsEnabled } from "@/lib/paypal";
import { releaseSellerPayPalPayout } from "@/services/payout/paypal-seller-payout";
import { OrderPayoutStatus } from "@/generated/prisma/enums";

export const runtime = "nodejs";

/**
 * Cron: retry PayPal payouts stuck in manual_review / missing processorTransferId.
 * Protect with CRON_SECRET like other crons.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  if (secret && auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPayPalSellerPayoutsEnabled()) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const stuck = await prisma.order.findMany({
    where: {
      sellerPayoutProcessor: "PAYPAL",
      paymentStatus: "paid",
      processorTransferId: null,
      payoutStatus: {
        in: [
          OrderPayoutStatus.instant_payout_ready,
          OrderPayoutStatus.fast_payout_ready,
          OrderPayoutStatus.label_payout_ready,
          OrderPayoutStatus.delivery_confirmed,
          OrderPayoutStatus.manual_review,
        ],
      },
    },
    select: { id: true },
    take: 40,
    orderBy: { updatedAt: "asc" },
  });

  let ok = 0;
  let failed = 0;
  for (const row of stuck) {
    const res = await releaseSellerPayPalPayout(row.id);
    if (res.ok) {
      ok += 1;
      await prisma.order.updateMany({
        where: {
          id: row.id,
          payoutStatus: { not: OrderPayoutStatus.paid_out },
          processorTransferId: { not: null },
        },
        data: {
          payoutStatus: OrderPayoutStatus.paid_out,
          payoutReleasedAt: new Date(),
          payoutBlockedReason: null,
        },
      });
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ scanned: stuck.length, ok, failed });
}
