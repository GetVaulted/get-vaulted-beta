/**
 * Dry-run by default: backfill Order Stripe charge/BT fee columns from PaymentIntents.
 *
 * Usage:
 *   npx tsx scripts/backfill-order-stripe-fees.ts
 *   npx tsx scripts/backfill-order-stripe-fees.ts --apply
 *   npx tsx scripts/backfill-order-stripe-fees.ts --apply --force
 *   npx tsx scripts/backfill-order-stripe-fees.ts --limit=50
 *
 * Never invents amounts — only writes values retrieved from Stripe.
 */
import { prisma } from "../src/lib/prisma";
import { persistOrderStripeChargeLedger } from "../src/lib/stripe-charge-ledger";
import { isStripeConfigured } from "../src/lib/stripe";

async function main() {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split("=")[1] ?? "200", 10) || 200) : 200;

  if (!isStripeConfigured()) {
    console.error("Stripe is not configured. Aborting.");
    process.exit(1);
  }

  const orders = await prisma.order.findMany({
    where: {
      stripePaymentIntentId: { not: null },
      ...(force
        ? {}
        : {
            OR: [
              { stripeChargeId: null },
              { stripeBalanceTransactionId: null },
              { stripeProcessingFeeCents: null },
              { stripeApplicationFeeCents: null },
              { stripeNetCents: null },
            ],
          }),
    },
    select: {
      id: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      stripeProcessingFeeCents: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  console.log(
    `[backfill-order-stripe-fees] mode=${apply ? "APPLY" : "DRY_RUN"} force=${force} candidates=${orders.length}`,
  );

  let wouldUpdate = 0;
  let updated = 0;
  let failed = 0;

  for (const o of orders) {
    if (!o.stripePaymentIntentId) continue;
    if (!apply) {
      wouldUpdate += 1;
      console.log("dry-run", {
        orderId: o.id,
        paymentIntentId: o.stripePaymentIntentId,
        hasCharge: Boolean(o.stripeChargeId),
        hasFee: o.stripeProcessingFeeCents != null,
      });
      continue;
    }
    try {
      const snap = await persistOrderStripeChargeLedger({
        orderId: o.id,
        paymentIntentId: o.stripePaymentIntentId,
        force,
      });
      if (snap) {
        updated += 1;
        console.log("updated", {
          orderId: o.id,
          stripeChargeId: snap.stripeChargeId,
          stripeProcessingFeeCents: snap.stripeProcessingFeeCents,
        });
      }
    } catch (e) {
      failed += 1;
      console.error("failed", o.id, e);
    }
  }

  console.log(
    `[backfill-order-stripe-fees] done wouldUpdate=${wouldUpdate} updated=${updated} failed=${failed}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
