/**
 * Persist fee snapshots for a few dtdt sample orders and print seller display values.
 * Safe: only fills null platformFee* columns; does not alter Stripe charges.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const samples = [
  "cmrsol3vy000h09l7rs2nomsb",
  "cmrr876qn000709l1zjw7yo2g",
  "cmrr8o3xw000409l4deb8jlt5",
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    ensureOrderPlatformFeeSnapshotPersisted,
    liveShowGmvForFeeTierReconstruction,
  } = await import("../src/lib/live-show-gmv");
  const { resolveSellerPlatformFeeDisplay } = await import("../src/lib/seller-platform-fee-display");
  const { ensureLiveShowFeeCache } = await import("../src/services/live-show-fee-settings");

  await ensureLiveShowFeeCache(true);
  const out = [];
  for (const id of samples) {
    await ensureOrderPlatformFeeSnapshotPersisted(id);
    const o = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        itemPriceUsd: true,
        platformFeeCents: true,
        platformFeePercentApplied: true,
        platformFeeBasisCents: true,
        platformFeePriorShowGmvUsd: true,
        stripeApplicationFeeCents: true,
        stripeProcessingFeeCents: true,
        shippingChargedCents: true,
        shippingLabelCostCents: true,
        listing: { select: { isCompanyListing: true, title: true } },
        liveShippingSession: {
          select: {
            liveShowId: true,
            liveShow: {
              select: { completedSalesGmvUsd: true, finalSalesGmvUsd: true, status: true },
            },
          },
        },
      },
    });
    if (!o) continue;
    const fee = resolveSellerPlatformFeeDisplay({
      itemPriceUsd: o.itemPriceUsd,
      isCompanyListing: o.listing.isCompanyListing,
      platformFeeCents: o.platformFeeCents,
      platformFeePercentApplied: o.platformFeePercentApplied,
      platformFeeBasisCents: o.platformFeeBasisCents,
      liveShowId: o.liveShippingSession?.liveShowId,
      liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(o.liveShippingSession?.liveShow),
      orderPaymentStatus: "paid",
    });
    out.push({
      orderId: o.id,
      title: o.listing.title,
      createdAt: o.createdAt,
      itemPriceUsd: o.itemPriceUsd,
      showId: o.liveShippingSession?.liveShowId,
      persisted: {
        platformFeeCents: o.platformFeeCents,
        platformFeePercentApplied: o.platformFeePercentApplied,
        platformFeeBasisCents: o.platformFeeBasisCents,
        priorGmv: o.platformFeePriorShowGmvUsd,
      },
      sellerGetVaultedFeeUsd: fee.platformFeeUsd,
      sellerEffectivePercent: fee.effectivePercent,
      source: fee.source,
      stripeApplicationFeeCents: o.stripeApplicationFeeCents,
      stripeProcessingFeeCents: o.stripeProcessingFeeCents,
      classification:
        fee.platformFeePercent === 8
          ? "HISTORICAL_OR_COLD_8"
          : fee.platformFeePercent === 7.25
            ? "HISTORICAL_OR_COLD_7_25"
            : fee.platformFeePercent === 6.75
              ? "BASE_TIER_6_75"
              : `OTHER_${fee.platformFeePercent}`,
    });
  }
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
