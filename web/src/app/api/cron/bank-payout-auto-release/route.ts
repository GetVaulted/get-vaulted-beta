import { NextResponse } from "next/server";
import { listOrdersReadyForAdminBankPayout } from "@/lib/admin/orders-ready-for-bank-payout";
import { releaseSellerReadyBankPayouts } from "@/lib/admin/release-seller-bank-payouts";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/** Recorded as the actor on the payout audit log for unattended cron releases. */
const SYSTEM_CRON_ACTOR = "system:cron:bank-payout-auto-release";

/**
 * Automatic Stripe bank payout release. Once a seller's order is shipped (all items shipped for
 * bundled live-show orders — see the sibling check in stripe-seller-payout.ts), label clawback is
 * settled, and there is no active refund/dispute request, push the Connect→bank transfer without
 * waiting on an admin to click the manual "release" button in Admin → Bank payouts.
 *
 * This calls the exact same per-seller release path an admin uses (releaseSellerReadyBankPayouts:
 * live Stripe balance check, FIFO oldest-first selection within available balance, per-order
 * idempotency via releaseSellerStripePayout) — it only removes the human click. PayPal-rail
 * payouts already release automatically elsewhere; this covers the Stripe-rail gap.
 *
 * Protect with CRON_SECRET, same pattern as the other cron routes in this directory.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Fail closed in production: an unset secret must never mean "no auth required".
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const ready = await listOrdersReadyForAdminBankPayout(1000);
  const sellerIds = Array.from(new Set(ready.map((o) => o.sellerId)));

  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  let totalPaidUsd = 0;
  let sellersThrew = 0;

  for (const sellerId of sellerIds) {
    try {
      const result = await releaseSellerReadyBankPayouts({
        sellerId,
        adminId: SYSTEM_CRON_ACTOR,
        reason: "Automatic bank payout release — all items shipped",
      });
      pushed += result.pushed;
      skipped += result.skipped;
      failed += result.failed;
      totalPaidUsd += result.totalPaidUsd;
    } catch (e) {
      sellersThrew += 1;
      console.error("[cron/bank-payout-auto-release] seller release threw", sellerId, e);
    }
  }

  // A cron returning HTTP 200 tells you nothing if it silently did less work than expected —
  // Sentry only fires on thrown exceptions, not "released 0 of N eligible sellers" (same gap
  // called out in the payout-tier cron). This is real money movement, so surface both an outright
  // per-seller crash and per-order failures inside an otherwise-successful seller run.
  if (sellersThrew > 0) {
    reportCronAnomaly(
      "bank-payout-auto-release",
      `${sellersThrew} of ${sellerIds.length} sellers threw while releasing bank payouts`,
    );
  } else if (failed > 0) {
    reportCronAnomaly(
      "bank-payout-auto-release",
      `${failed} order(s) failed to release across ${sellerIds.length} sellers`,
    );
  }

  return NextResponse.json({
    ok: true,
    sellersEvaluated: sellerIds.length,
    sellersThrew,
    pushed,
    skipped,
    failed,
    totalPaidUsd: Math.round(totalPaidUsd * 100) / 100,
  });
}
