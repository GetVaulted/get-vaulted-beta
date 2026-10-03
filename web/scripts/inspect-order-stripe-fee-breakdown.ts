/**
 * Read-only Stripe + DB fee breakdown for one order.
 * Usage: npx tsx scripts/inspect-order-stripe-fee-breakdown.ts <orderId>
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const orderId = process.argv[2]?.trim() || "cmrr8o3xw000409l4deb8jlt5";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getStripe } = await import("../src/lib/stripe");
  const { ensureLiveShowFeeCache } = await import("../src/services/live-show-fee-settings");
  const {
    liveShowPlatformFeePercent,
    applicationFeeCentsFromSubtotalUsd,
    completedLiveShowGmvBeforeSale,
  } = await import("../src/lib/platform-fee-policy");
  const { estimateStripeProcessingFeeCents } = await import("../src/lib/seller-payout-estimate");
  const { liveShowGmvForFeeTierReconstruction } = await import("../src/lib/live-show-gmv");

  await ensureLiveShowFeeCache(true);

  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxAmountCents: true,
      totalUsd: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      stripeTransferId: true,
      shippingLabelCostReversedCents: true,
      seller: { select: { username: true, sellerPlatformFeePercentOverride: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: {
              status: true,
              completedSalesGmvUsd: true,
              finalSalesGmvUsd: true,
            },
          },
        },
      },
    },
  });
  if (!o) {
    console.log(JSON.stringify({ error: "NOT_FOUND", orderId }));
    return;
  }

  const gmv = liveShowGmvForFeeTierReconstruction(o.liveShippingSession?.liveShow) ?? 0;
  const gmvBefore = completedLiveShowGmvBeforeSale(gmv, o.itemPriceUsd);
  const pct =
    o.seller.sellerPlatformFeePercentOverride ?? liveShowPlatformFeePercent(gmvBefore);
  const platformFeeCents = applicationFeeCentsFromSubtotalUsd(o.itemPriceUsd, pct);
  const buyerTotalCents = Math.round(o.totalUsd * 100);
  const estimatedProcessing = estimateStripeProcessingFeeCents(buyerTotalCents);

  let stripeEvidence: Record<string, unknown> | null = null;
  if (o.stripePaymentIntentId) {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(o.stripePaymentIntentId, {
      expand: ["latest_charge.balance_transaction", "latest_charge.application_fee"],
    });
    const ch = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null;
    const bt =
      ch && typeof ch.balance_transaction === "object" && ch.balance_transaction
        ? ch.balance_transaction
        : null;
    const afRaw = ch?.application_fee;
    const af = afRaw && typeof afRaw === "object" ? afRaw : null;
    stripeEvidence = {
      paymentIntentId: pi.id,
      amount: pi.amount,
      application_fee_amount: pi.application_fee_amount,
      transfer_data: pi.transfer_data,
      chargeId: ch?.id ?? null,
      chargeApplicationFeeAmount: ch?.application_fee_amount ?? null,
      balanceTransactionFee: bt && "fee" in bt ? bt.fee : null,
      balanceTransactionNet: bt && "net" in bt ? bt.net : null,
      applicationFeeObjectAmount: af && "amount" in af ? af.amount : afRaw,
    };
  }

  console.log(
    JSON.stringify(
      {
        orderId,
        seller: o.seller.username,
        saleTypeHint: "break spot (from title pattern) / live session order",
        itemSubtotalCents: Math.round(o.itemPriceUsd * 100),
        shippingCollectedCents: Math.round(o.shippingPriceUsd * 100),
        taxCollectedCents: o.taxAmountCents,
        buyerTotalCents,
        priorCompletedShowGmvUsd: gmvBefore,
        tierSelectedPercent: pct,
        expectedPlatformFeeCents: platformFeeCents,
        estimatedStripeProcessingPassThroughCents: estimatedProcessing,
        expectedCombinedApplicationFeeCentsIfUntaxed: platformFeeCents + estimatedProcessing,
        dbStripeApplicationFeeCents: o.stripeApplicationFeeCents,
        dbStripeProcessingFeeCents: o.stripeProcessingFeeCents,
        labelClawbackCents: o.shippingLabelCostReversedCents,
        stripeEvidence,
        mathCheck: {
          appFeeEqualsPlatformPlusEstProcessing:
            o.stripeApplicationFeeCents === platformFeeCents + estimatedProcessing,
          appFeeMinusEstProcessingEqualsPlatform:
            o.stripeApplicationFeeCents != null
              ? o.stripeApplicationFeeCents - estimatedProcessing === platformFeeCents
              : null,
        },
        conclusionHint:
          "Untaxed Connect charges set application_fee_amount = platformFee + estimatedProcessing (seller pays processing).",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
