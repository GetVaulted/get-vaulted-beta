/**
 * Read-only: dump PlatformLiveShowFeeConfig + recent live orders with fee evidence.
 * Usage: npx tsx scripts/inspect-live-fee-config-and-orders.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { ensureLiveShowFeeCache, getCachedLiveShowFeeConfig } = await import(
    "../src/services/live-show-fee-settings"
  );
  const {
    marketplacePlatformFeePercent,
    liveShowPlatformFeePercent,
    applicationFeeCentsFromSubtotalUsd,
    completedLiveShowGmvBeforeSale,
  } = await import("../src/lib/platform-fee-policy");
  const { ensureMarketplacePlatformFeeCache } = await import(
    "../src/services/platform-fee-settings"
  );
  const { estimateStripeProcessingFeeCents } = await import(
    "../src/lib/seller-payout-estimate"
  );

  const row = await prisma.platformLiveShowFeeConfig.findUnique({ where: { id: "default" } });
  await ensureLiveShowFeeCache(true);
  await ensureMarketplacePlatformFeeCache(true);
  const cached = getCachedLiveShowFeeConfig();

  const recentLiveOrders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      itemPriceUsd: { gt: 0 },
      OR: [
        { liveShippingSessionId: { not: null } },
        { inventoryHolds: { some: {} } },
        { variantPurchaseFulfillment: { isNot: null } },
        { breakSpotFulfillment: { isNot: null } },
      ],
    },
    select: {
      id: true,
      sellerId: true,
      liveShippingSessionId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      totalUsd: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      paymentProcessor: true,
      createdAt: true,
      listing: { select: { title: true, isCompanyListing: true } },
      seller: {
        select: {
          username: true,
          stripeAccountId: true,
          sellerPlatformFeePercentOverride: true,
        },
      },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: {
              id: true,
              title: true,
              status: true,
              completedSalesGmvUsd: true,
              finalSalesGmvUsd: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const analyzed = recentLiveOrders.map((o) => {
    const itemCents = Math.round(Math.max(0, o.itemPriceUsd) * 100);
    const shippingCents = Math.round(Math.max(0, o.shippingPriceUsd) * 100);
    const taxCents = Math.max(0, o.taxAmountCents ?? 0);
    const buyerTotalCents = Math.round(Math.max(0, o.totalUsd) * 100);
    const appFee = o.stripeApplicationFeeCents;
    const processing = o.stripeProcessingFeeCents;
    const show = o.liveShippingSession?.liveShow ?? null;
    const gmvNow =
      show?.status === "live"
        ? show.completedSalesGmvUsd
        : (show?.finalSalesGmvUsd ?? show?.completedSalesGmvUsd ?? 0);
    const gmvBefore = completedLiveShowGmvBeforeSale(gmvNow ?? 0, o.itemPriceUsd);
    const expectedPct = o.seller.sellerPlatformFeePercentOverride != null
      ? o.seller.sellerPlatformFeePercentOverride
      : liveShowPlatformFeePercent(gmvBefore);
    const expectedPlatformFeeCents = applicationFeeCentsFromSubtotalUsd(
      o.itemPriceUsd,
      expectedPct,
    );
    const impliedPctFromAppFee =
      appFee != null && itemCents > 0 ? Math.round((appFee / itemCents) * 10000) / 100 : null;
    const estimatedProcessingOnBuyerTotal = estimateStripeProcessingFeeCents(buyerTotalCents);

    // If stripeApplicationFee includes processing (untaxed path), platform-only ≈ appFee - processing
    const inferredPlatformFromAppFeeMinusProcessing =
      appFee != null && processing != null ? Math.max(0, appFee - processing) : null;

    return {
      orderId: o.id,
      seller: o.seller.username,
      sellerStripeAccountId: o.seller.stripeAccountId,
      sellerOverride: o.seller.sellerPlatformFeePercentOverride,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      showStatus: show?.status ?? null,
      gmvNow,
      gmvBeforeSaleReconstructed: gmvBefore,
      expectedTierPercent: expectedPct,
      expectedPlatformFeeCents,
      itemPriceUsd: o.itemPriceUsd,
      itemCents,
      shippingCents,
      taxCents,
      buyerTotalCents,
      stripeApplicationFeeCents: appFee,
      stripeProcessingFeeCents: processing,
      impliedPercentIfAppFeeIsAllPlatform: impliedPctFromAppFee,
      inferredPlatformFeeIfAppFeeIncludesProcessing: inferredPlatformFromAppFeeMinusProcessing,
      inferredPercentIfAppFeeMinusProcessing:
        inferredPlatformFromAppFeeMinusProcessing != null && itemCents > 0
          ? Math.round((inferredPlatformFromAppFeeMinusProcessing / itemCents) * 10000) / 100
          : null,
      estimatedProcessingOnBuyerTotal,
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      createdAt: o.createdAt.toISOString(),
      title: o.listing.title,
    };
  });

  const aboveConfiguredBase = analyzed.filter((a) => {
    const base = cached.tier1FeePercent;
    const pct =
      a.inferredPercentIfAppFeeMinusProcessing ?? a.impliedPercentIfAppFeeIsAllPlatform;
    return pct != null && pct > base + 0.15;
  });

  // Pick one detailed example: prefer dtdt / recent with app fee
  const sample =
    analyzed.find((a) => a.stripeApplicationFeeCents != null && a.itemCents > 0) ??
    analyzed[0] ??
    null;

  console.log(
    JSON.stringify(
      {
        dbRow: row,
        cachedConfigAfterEnsure: cached,
        marketplaceFeePercent: marketplacePlatformFeePercent(),
        codeDefaultsStillInSource: {
          tier1: 6.75,
          tier2Threshold: 3000,
          tier2: 5.75,
          tier3Threshold: 5500,
          tier3: 5.0,
        },
        intendedConfigFromUser: {
          tier1: 6.75,
          tier2Threshold: 3000,
          tier2: 5.75,
          tier3Threshold: 5500,
          tier3: 5.0,
        },
        dbMatchesIntended:
          row != null &&
          Math.abs(row.tier1FeePercent - 6.75) < 0.001 &&
          Math.abs(row.tier2FeePercent - 5.75) < 0.001 &&
          Math.abs(row.tier3FeePercent - 5.0) < 0.001 &&
          Math.abs(row.tier2ThresholdUsd - 3000) < 0.001 &&
          Math.abs(row.tier3ThresholdUsd - 5500) < 0.001,
        recentLiveOrderCount: analyzed.length,
        ordersWhereAppFeeImpliesAboveConfiguredBase: aboveConfiguredBase.length,
        aboveConfiguredBaseSample: aboveConfiguredBase.slice(0, 8),
        detailedSample: sample,
        recentSample: analyzed.slice(0, 10),
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
