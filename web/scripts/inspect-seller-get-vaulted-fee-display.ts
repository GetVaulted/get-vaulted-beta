/**
 * Prove what the seller-facing Get Vaulted fee would show for dtdt orders
 * under cold cache (code defaults) vs warmed DB config.
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
  const {
    invalidateLiveShowFeeCache,
    ensureLiveShowFeeCache,
    getCachedLiveShowFeeConfig,
  } = await import("../src/services/live-show-fee-settings");
  const {
    estimatePlatformFeeUsd,
    resolvePlatformFeePercentForSellerOrder,
  } = await import("../src/lib/seller-payout-estimate");
  const { liveShowGmvForFeeTierReconstruction } = await import("../src/lib/live-show-gmv");
  const { estimateStripeProcessingFeeCents } = await import("../src/lib/seller-payout-estimate");

  const seller = await prisma.user.findFirst({
    where: { username: "dtdt" },
    select: { id: true, sellerPlatformFeePercentOverride: true },
  });
  if (!seller) {
    console.log(JSON.stringify({ error: "seller_not_found" }));
    return;
  }

  const orders = await prisma.order.findMany({
    where: {
      sellerId: seller.id,
      paymentStatus: "paid",
      liveShippingSessionId: { not: null },
      itemPriceUsd: { gt: 0 },
    },
    select: {
      id: true,
      createdAt: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxAmountCents: true,
      totalUsd: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingChargedCents: true,
      paymentStatus: true,
      listing: { select: { title: true, isCompanyListing: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: {
              status: true,
              completedSalesGmvUsd: true,
              finalSalesGmvUsd: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Cold cache path (what seller APIs do today — they never call ensureLiveShowFeeCache)
  invalidateLiveShowFeeCache();
  const coldCfg = getCachedLiveShowFeeConfig();

  const coldRows = orders.map((o) => {
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const gmv = liveShowGmvForFeeTierReconstruction(liveShow);
    const pct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: gmv,
      orderItemPriceUsd: o.itemPriceUsd,
      orderPaymentStatus: o.paymentStatus,
      sellerPlatformFeePercentOverride: seller.sellerPlatformFeePercentOverride,
    });
    const estimateUsd = estimatePlatformFeeUsd({
      itemPriceUsd: o.itemPriceUsd,
      platformFeePercent: pct,
    });
    const financialsUsd =
      o.stripeApplicationFeeCents != null
        ? o.stripeApplicationFeeCents / 100
        : estimateUsd;
    const financialsEffectivePct =
      o.itemPriceUsd > 0 ? (financialsUsd / o.itemPriceUsd) * 100 : null;
    return {
      orderId: o.id,
      createdAt: o.createdAt.toISOString(),
      showId: o.liveShippingSession?.liveShowId,
      itemPriceUsd: o.itemPriceUsd,
      gmvForTier: gmv,
      coldCachePercent: pct,
      orderDetailGetVaultedFeeUsd: estimateUsd,
      financialsPlatformFeeUsd: financialsUsd,
      financialsEffectivePctIfDivideByItem: financialsEffectivePct,
      stripeApplicationFeeCents: o.stripeApplicationFeeCents,
      title: o.listing.title,
    };
  });

  // Warmed DB path
  await ensureLiveShowFeeCache(true);
  const warmCfg = getCachedLiveShowFeeConfig();
  const warmRows = orders.map((o) => {
    const liveShow = o.liveShippingSession?.liveShow ?? null;
    const gmv = liveShowGmvForFeeTierReconstruction(liveShow);
    const pct = resolvePlatformFeePercentForSellerOrder({
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: gmv,
      orderItemPriceUsd: o.itemPriceUsd,
      orderPaymentStatus: o.paymentStatus,
      sellerPlatformFeePercentOverride: seller.sellerPlatformFeePercentOverride,
    });
    const estimateUsd = estimatePlatformFeeUsd({
      itemPriceUsd: o.itemPriceUsd,
      platformFeePercent: pct,
    });
    return {
      orderId: o.id,
      warmPercent: pct,
      warmGetVaultedFeeUsd: estimateUsd,
      gmvForTier: gmv,
    };
  });

  const byColdPct: Record<string, number> = {};
  for (const r of coldRows) {
    const k = String(r.coldCachePercent);
    byColdPct[k] = (byColdPct[k] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        coldConfigDefaults: coldCfg,
        warmDbConfig: warmCfg,
        coldPercentHistogram: byColdPct,
        note: {
          orderDetailFormula:
            "platformFeeEstimateUsd = estimatePlatformFeeUsd(item, resolvePlatformFeePercentForSellerOrder(...)) — NO cache warm on /api/account/sales",
          financialsFormula:
            "platformFeeUsd = stripeApplicationFeeCents/100 ?? estimate; percent label = resolvePlatformFeePercentForSellerOrder (cold)",
        },
        samplesCold: coldRows.slice(0, 12),
        samplesWarm: warmRows.slice(0, 12),
        proofPairs: coldRows.slice(0, 8).map((c, i) => ({
          orderId: c.orderId,
          coldPercent: c.coldCachePercent,
          warmPercent: warmRows[i]?.warmPercent,
          orderDetailFeeCold: c.orderDetailGetVaultedFeeUsd,
          orderDetailFeeWarm: warmRows[i]?.warmGetVaultedFeeUsd,
          financialsDollarUsesAppFee: c.financialsPlatformFeeUsd,
          financialsEffectivePct: c.financialsEffectivePctIfDivideByItem,
        })),
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
