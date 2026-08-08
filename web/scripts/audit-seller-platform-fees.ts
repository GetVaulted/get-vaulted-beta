/**
 * Read-only seller fee / platform-take audit.
 *
 * Flags any Get Vaulted platform fee above 6.75%, missing snapshots, and cases where
 * Stripe application_fee looks inflated because processing was bundled in.
 *
 *   cd web && npx tsx scripts/audit-seller-platform-fees.ts bigdawgbreakers
 *   cd web && npx tsx scripts/audit-seller-platform-fees.ts bigdawgbreakers --days=7
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { PLATFORM_FEE_PERCENT_MAX } from "../src/lib/platform-fee-defaults";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function usd(n: number): number {
  return Math.round(n * 100) / 100;
}

function moneyFromCents(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return usd(cents / 100);
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const daysRaw = argv.find((a) => a.startsWith("--days="))?.slice("--days=".length);
  const days = daysRaw != null && Number.isFinite(Number(daysRaw)) ? Math.max(1, Number(daysRaw)) : null;
  const username = (positional[0] || "bigdawgbreakers").replace(/^@+/, "");
  return { username, days };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      JSON.stringify(
        {
          error: "DATABASE_URL is not set",
          how: "cd web && npx tsx scripts/audit-seller-platform-fees.ts bigdawgbreakers",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const { username, days } = parseArgs(process.argv.slice(2));
  const { prisma } = await import("../src/lib/prisma");
  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const { resolveSellerPlatformFeeDisplay } = await import("../src/lib/seller-platform-fee-display");
  const { liveShowGmvForFeeTierReconstruction } = await import("../src/lib/live-show-gmv");
  const { ensureLiveShowFeeCache } = await import("../src/services/live-show-fee-settings");
  const { ensureMarketplacePlatformFeeCache, getCachedMarketplacePlatformFeePercent } = await import(
    "../src/services/platform-fee-settings",
  );
  const { getCachedLiveShowFeeConfig } = await import("../src/services/live-show-fee-settings");
  const { estimateStripeProcessingFeeCents } = await import("../src/lib/seller-payout-estimate");

  await Promise.all([ensureLiveShowFeeCache(true), ensureMarketplacePlatformFeeCache(true)]);

  const seller = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: {
      id: true,
      username: true,
      email: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboardingComplete: true,
      sellerPlatformFeePercentOverride: true,
      sellerPlatformFeeOverrideExpiresAt: true,
      payoutMetrics: {
        select: {
          lifetimeGmvUsd: true,
          lifetimeInstantPayoutUsd: true,
          unresolvedDisputeCount: true,
        },
      },
    },
  });
  if (!seller) {
    console.error(JSON.stringify({ error: "SELLER_NOT_FOUND", username }, null, 2));
    process.exit(1);
  }

  const since = days != null ? new Date(Date.now() - days * 86400_000) : null;
  const orders = await prisma.order.findMany({
    where: {
      sellerId: seller.id,
      paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback"] },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      totalUsd: true,
      paymentStatus: true,
      payoutStatus: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
      platformFeePriorShowGmvUsd: true,
      platformFeeSellerOverrideApplied: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      stripePaymentIntentId: true,
      stripeTransferId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      listing: { select: { id: true, title: true, isCompanyListing: true } },
      buyer: { select: { username: true } },
      liveShippingSession: {
        select: {
          liveShowId: true,
          liveShow: {
            select: {
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
  });

  type Flag =
    | "FEE_ABOVE_6_75"
    | "MISSING_FEE_SNAPSHOT"
    | "APP_FEE_LOOKS_INFLATED_VS_PLATFORM"
    | "EFFECTIVE_PCT_ABOVE_6_75"
    | "COMPANY_WITH_NONZERO_FEE";

  const rows = [];
  const flags: Array<{ orderId: string; flags: Flag[]; detail: Record<string, unknown> }> = [];

  let gmvItemUsd = 0;
  let grossChargeUsd = 0;
  let platformFeeUsd = 0;
  let stripeAppFeeUsd = 0;
  let processingUsd = 0;
  let above675Count = 0;
  let missingSnapshotCount = 0;
  let appFeeInflatedCount = 0;

  for (const o of orders) {
    if (o.paymentStatus === "paid" || o.paymentStatus === "layaway_completed") {
      gmvItemUsd = usd(gmvItemUsd + Math.max(0, o.itemPriceUsd));
      grossChargeUsd = usd(grossChargeUsd + Math.max(0, o.totalUsd));
    }

    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: o.itemPriceUsd,
      isCompanyListing: Boolean(o.listing.isCompanyListing),
      platformFeeCents: o.platformFeeCents,
      platformFeePercentApplied: o.platformFeePercentApplied,
      platformFeeBasisCents: o.platformFeeBasisCents,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(o.liveShippingSession?.liveShow ?? null),
      orderPaymentStatus: o.paymentStatus,
      sellerPlatformFeePercentOverride: seller.sellerPlatformFeePercentOverride,
    });

    const appFee = moneyFromCents(o.stripeApplicationFeeCents);
    const proc =
      moneyFromCents(o.stripeProcessingFeeCents) ??
      usd(estimateStripeProcessingFeeCents(Math.round(o.totalUsd * 100)) / 100);
    const orderFlags: Flag[] = [];

    if (fee.source !== "persisted" && !o.listing.isCompanyListing) {
      orderFlags.push("MISSING_FEE_SNAPSHOT");
      missingSnapshotCount += 1;
    }
    if (fee.platformFeePercent > PLATFORM_FEE_PERCENT_MAX + 0.001) {
      orderFlags.push("FEE_ABOVE_6_75");
      above675Count += 1;
    }
    if (fee.effectivePercent > PLATFORM_FEE_PERCENT_MAX + 0.05) {
      orderFlags.push("EFFECTIVE_PCT_ABOVE_6_75");
    }
    if (o.listing.isCompanyListing && fee.platformFeeCents > 0) {
      orderFlags.push("COMPANY_WITH_NONZERO_FEE");
    }
    // Stripe app fee often = platform fee + processing − credits. Flag only when app fee clearly
    // exceeds platform fee + processing + $0.50 slack (unexpected bleed into platform take).
    if (
      appFee != null &&
      !o.listing.isCompanyListing &&
      fee.platformFeeCents > 0 &&
      appFee > fee.platformFeeUsd + proc + 0.5
    ) {
      orderFlags.push("APP_FEE_LOOKS_INFLATED_VS_PLATFORM");
      appFeeInflatedCount += 1;
    }

    if (o.paymentStatus === "paid" || o.paymentStatus === "layaway_completed") {
      platformFeeUsd = usd(platformFeeUsd + fee.platformFeeUsd);
      if (appFee != null) stripeAppFeeUsd = usd(stripeAppFeeUsd + appFee);
      processingUsd = usd(processingUsd + proc);
    }

    const row = {
      orderId: o.id,
      paidAt: o.createdAt.toISOString(),
      paymentStatus: o.paymentStatus,
      payoutStatus: o.payoutStatus,
      title: o.listing.title,
      buyer: o.buyer.username,
      isCompanyListing: o.listing.isCompanyListing,
      liveShowId: o.liveShippingSession?.liveShowId ?? null,
      liveShowTitle: o.liveShippingSession?.liveShow?.title ?? null,
      itemUsd: usd(o.itemPriceUsd),
      shippingUsd: usd(o.shippingPriceUsd),
      taxUsd: usd(Math.max(o.taxUsd, (o.taxAmountCents ?? 0) / 100)),
      totalUsd: usd(o.totalUsd),
      getVaultedFeeUsd: fee.platformFeeUsd,
      getVaultedFeePercent: fee.platformFeePercent,
      effectivePercent: usd(fee.effectivePercent),
      feeSource: fee.source,
      stripeApplicationFeeUsd: appFee,
      stripeProcessingFeeUsd: moneyFromCents(o.stripeProcessingFeeCents),
      priorShowGmvUsd: o.platformFeePriorShowGmvUsd,
      overrideApplied: o.platformFeeSellerOverrideApplied,
      flags: orderFlags,
    };
    rows.push(row);
    if (orderFlags.length) {
      flags.push({
        orderId: o.id,
        flags: orderFlags,
        detail: {
          getVaultedFeePercent: fee.platformFeePercent,
          effectivePercent: fee.effectivePercent,
          getVaultedFeeUsd: fee.platformFeeUsd,
          stripeApplicationFeeUsd: appFee,
          processingUsd: proc,
          itemUsd: o.itemPriceUsd,
          totalUsd: o.totalUsd,
        },
      });
    }
  }

  let connect: Record<string, unknown> | null = null;
  if (isStripeConfigured() && seller.stripeAccountId?.trim()) {
    try {
      const stripe = getStripe();
      const bal = await stripe.balance.retrieve({ stripeAccount: seller.stripeAccountId });
      connect = {
        stripeAccountId: seller.stripeAccountId,
        availableUsd: usd(
          bal.available.filter((b) => b.currency === "usd").reduce((s, b) => s + b.amount, 0) / 100,
        ),
        pendingUsd: usd(
          bal.pending.filter((b) => b.currency === "usd").reduce((s, b) => s + b.amount, 0) / 100,
        ),
      };
    } catch (e) {
      connect = {
        stripeAccountId: seller.stripeAccountId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const liveCfg = getCachedLiveShowFeeConfig();
  const report = {
    seller: {
      id: seller.id,
      username: seller.username,
      email: seller.email,
      stripeAccountId: seller.stripeAccountId,
      stripeChargesEnabled: seller.stripeChargesEnabled,
      stripePayoutsEnabled: seller.stripePayoutsEnabled,
      stripeOnboardingComplete: seller.stripeOnboardingComplete,
      feeOverridePercent: seller.sellerPlatformFeePercentOverride,
      feeOverrideExpiresAt: seller.sellerPlatformFeeOverrideExpiresAt?.toISOString() ?? null,
      lifetimeGmvUsd: seller.payoutMetrics?.lifetimeGmvUsd ?? null,
      unresolvedDisputeCount: seller.payoutMetrics?.unresolvedDisputeCount ?? null,
    },
    platformFeeConfig: {
      marketplacePercent: getCachedMarketplacePlatformFeePercent(),
      live: liveCfg,
      hardCapPercent: PLATFORM_FEE_PERCENT_MAX,
    },
    window: {
      days,
      since: since?.toISOString() ?? null,
      note: days == null ? "all paid/refunded/chargeback orders for seller" : `last ${days} days by createdAt`,
    },
    totals: {
      orderCount: orders.length,
      gmvItemUsd,
      grossChargeUsd,
      getVaultedPlatformFeeUsd: platformFeeUsd,
      stripeApplicationFeeUsdSum: stripeAppFeeUsd,
      processingUsdSum: processingUsd,
      impliedPlatformFeeRatePct: gmvItemUsd > 0 ? usd((platformFeeUsd / gmvItemUsd) * 100) : null,
    },
    audit: {
      ok: above675Count === 0 && appFeeInflatedCount === 0,
      feeAbove675Count: above675Count,
      missingSnapshotCount,
      appFeeInflatedVsPlatformCount: appFeeInflatedCount,
      flaggedOrderCount: flags.length,
      explanation: {
        getVaultedFee: "Order.platformFee* snapshot (item × ≤6.75%). This is platform profit from fees.",
        stripeApplicationFee:
          "Often platform fee + seller-paid processing. Larger than Get Vaulted fee is normal — not extra platform take.",
        inflatedFlag:
          "APP_FEE_LOOKS_INFLATED_VS_PLATFORM only when application_fee > platform fee + processing + $0.50.",
      },
    },
    connect,
    flaggedOrders: flags.slice(0, 100),
    recentOrders: rows.slice(0, 50),
    generatedAt: new Date().toISOString(),
  };

  const outBase = path.join(
    webRoot,
    "reports",
    `audit-${username}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const body = JSON.stringify(report, null, 2);
  fs.writeFileSync(`${outBase}.json`, body, "utf8");
  const sha = createHash("sha256").update(body).digest("hex");
  fs.writeFileSync(`${outBase}.sha256`, `${sha}\n`, "utf8");

  console.log(JSON.stringify({ ...report, reportPath: `${outBase}.json`, sha256: sha }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
