/**
 * Read-only diagnostic: explain why some paid transactions show a Stripe "application fee"
 * line and others do not, without any money being lost.
 *
 * Root cause under investigation: on a TAXED destination charge the code uses an explicit
 * `transfer_data.amount = subtotal - fee` (seller gets item - fee; platform keeps fee + tax),
 * which records NO `application_fee_amount`. On an UNTAXED charge it uses `application_fee_amount`
 * directly, which shows up in Stripe's Connect → Application fees report. Company listings are 0%.
 *
 * Usage (from web/):
 *   npx tsx scripts/diagnose-platform-fee-collection.ts            # last 30 days
 *   npx tsx scripts/diagnose-platform-fee-collection.ts --days 45
 *   npx tsx scripts/diagnose-platform-fee-collection.ts --since 2026-07-01
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

function resolveSince(): Date {
  const sinceStr = arg("since");
  if (sinceStr) {
    const d = new Date(sinceStr);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const days = Number(arg("days") ?? 30);
  const n = Number.isFinite(days) && days > 0 ? days : 30;
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

const PAID_ORDER_STATUSES = ["paid"];

async function main() {
  const { createPostgresPrismaClient } = await import("../src/lib/prisma-pg-factory");
  const { resolveDatabaseUrl, redactDatabaseUrl } = await import("../src/lib/resolve-database-url");

  const since = resolveSince();
  console.log("=== Platform fee collection diagnostic ===");
  console.log("db:   ", redactDatabaseUrl(resolveDatabaseUrl()));
  console.log("since:", since.toISOString());
  console.log("");

  const prisma = createPostgresPrismaClient(resolveDatabaseUrl());
  try {
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: since }, paymentStatus: { in: PAID_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        itemPriceUsd: true,
        taxUsd: true,
        taxAmountCents: true,
        totalUsd: true,
        sellerId: true,
        listing: { select: { buyingFormat: true, isCompanyListing: true } },
        liveShippingSessionId: true,
      },
    });

    // Per-seller override snapshot (an active, non-expired override beats the global rate; 0 => no fee).
    const { effectiveSellerPlatformFeePercentOverride } = await import(
      "../src/services/seller-platform-fee-override"
    );
    const sellerIds = Array.from(new Set(orders.map((o) => o.sellerId)));
    const overrideRows = await prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: {
        id: true,
        sellerPlatformFeePercentOverride: true,
        sellerPlatformFeeOverrideExpiresAt: true,
      },
    });
    const overrideBySeller = new Map(
      overrideRows.map((r) => [
        r.id,
        effectiveSellerPlatformFeePercentOverride({
          percent: r.sellerPlatformFeePercentOverride,
          expiresAt: r.sellerPlatformFeeOverrideExpiresAt,
        }),
      ]),
    );

    type Bucket =
      | "app_fee_line" // untaxed, non-company, fee > 0 => shows in Stripe Application fees
      | "taxed_fee_kept" // taxed => fee kept via reduced transfer, NO app-fee line
      | "company_zero" // company listing => 0% by design
      | "override_zero"; // seller override 0% => no fee by design

    const counts: Record<Bucket, number> = {
      app_fee_line: 0,
      taxed_fee_kept: 0,
      company_zero: 0,
      override_zero: 0,
    };

    console.log("--- Paid orders (auction win / buy-now / live) ---");
    for (const o of orders) {
      const taxed = (o.taxAmountCents ?? 0) > 0 || (o.taxUsd ?? 0) > 0;
      const company = Boolean(o.listing?.isCompanyListing);
      const override = overrideBySeller.get(o.sellerId);
      const overrideZero = override != null && override <= 0;

      let bucket: Bucket;
      if (company) bucket = "company_zero";
      else if (overrideZero) bucket = "override_zero";
      else if (taxed) bucket = "taxed_fee_kept";
      else bucket = "app_fee_line";
      counts[bucket] += 1;

      console.log(
        [
          o.createdAt.toISOString().slice(0, 10),
          o.id.slice(0, 8),
          (o.listing?.buyingFormat ?? "?").padEnd(8),
          o.liveShippingSessionId ? "live " : "mkt  ",
          `item $${o.itemPriceUsd.toFixed(2)}`.padEnd(14),
          `tax $${(o.taxUsd ?? 0).toFixed(2)}`.padEnd(11),
          bucket,
        ].join("  "),
      );
    }

    // Tips (0% platform fee by design) and trade platform fees (direct charge, no app-fee line).
    const tipsPaid = await prisma.liveTip.count({
      where: { status: "paid", paidAt: { gte: since } },
    });
    const tradeProposerFees = await prisma.tradeOffer.count({
      where: { proposerPlatformFeePaidAt: { gte: since } },
    });
    const tradeRecipientFees = await prisma.tradeOffer.count({
      where: { recipientPlatformFeePaidAt: { gte: since } },
    });
    const tradeFeePayments = tradeProposerFees + tradeRecipientFees;

    const ordersWithStripeAppFeeLine = counts.app_fee_line;
    const ordersFeeKeptNoLine = counts.taxed_fee_kept;
    const ordersZeroByDesign = counts.company_zero + counts.override_zero;

    console.log("");
    console.log("=== Summary ===");
    console.log(`Paid orders in window:            ${orders.length}`);
    console.log(`  • Stripe application-fee line:  ${ordersWithStripeAppFeeLine}  (untaxed, non-company — shows in Stripe Application fees)`);
    console.log(`  • Fee KEPT, no app-fee line:    ${ordersFeeKeptNoLine}  (TAXED — fee retained via reduced seller transfer)`);
    console.log(`  • 0% by design (company):       ${counts.company_zero}`);
    console.log(`  • 0% by design (seller override):${counts.override_zero}`);
    console.log("");
    console.log(`Tips paid (always 0% fee):        ${tipsPaid}`);
    console.log(`Trade platform-fee charges:       ${tradeFeePayments}  (flat $2.99 direct charge — not an application fee)`);
    console.log("");
    console.log(
      `A Stripe "Application fees" count would show ~${ordersWithStripeAppFeeLine} of ` +
        `${orders.length + tipsPaid + tradeFeePayments} total charges, even though the fee ` +
        `was collected on every taxed order too (just as a reduced transfer, not a fee line).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
