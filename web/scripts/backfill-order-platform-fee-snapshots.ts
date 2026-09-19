/**
 * Platform fee snapshot backfill — dry-run audit by default.
 *
 * Dry-run writes a full evidence report (JSON + CSV + SHA-256). Does NOT alter Stripe
 * charges, seller balances, or payouts. Ambiguous rows are never written.
 *
 * Usage:
 *   npx tsx scripts/backfill-order-platform-fee-snapshots.ts
 *   npx tsx scripts/backfill-order-platform-fee-snapshots.ts --seller=dtdt
 *   npx tsx scripts/backfill-order-platform-fee-snapshots.ts --seller=dtdt --apply
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { persistOrderPlatformFeeSnapshot } = await import("../src/lib/live-show-gmv");
  const { ensureLiveShowFeeCache, getLiveShowFeeConfig } = await import(
    "../src/services/live-show-fee-settings"
  );
  const { ensureMarketplacePlatformFeeCache } = await import("../src/services/platform-fee-settings");
  const audit = await import("../src/lib/platform-fee-snapshot-backfill-audit");
  const {
    buildBackfillSummary,
    classifyPlatformFeeBackfillRow,
    compareOrderCompletion,
    priorShowGmvUsdBeforeOrder,
    sellerOverridePercentAt,
  } = audit;
  type PlatformFeeBackfillAuditRow = audit.PlatformFeeBackfillAuditRow;

  const apply = process.argv.includes("--apply");
  const sellerArg = process.argv.find((a) => a.startsWith("--seller="))?.slice("--seller=".length);

  let sellerFilterId: string | undefined;
  let sellerFilterHandle: string | null = null;
  if (sellerArg) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: sellerArg }, { id: sellerArg }] },
      select: { id: true, username: true },
    });
    if (!user) {
      console.error(`Seller not found: ${sellerArg}`);
      process.exit(1);
    }
    sellerFilterId = user.id;
    sellerFilterHandle = user.username;
    console.error(`Scoped to seller @${user.username ?? user.id}`);
  }

  await ensureLiveShowFeeCache(true);
  await ensureMarketplacePlatformFeeCache(true);
  const liveFee = await getLiveShowFeeConfig();
  const marketplaceRow = await prisma.platformMarketplaceFeeConfig.findUnique({
    where: { id: "default" },
    select: { platformFeePercent: true, updatedAt: true },
  });
  const marketplaceFeePercent = marketplaceRow?.platformFeePercent ?? 8;
  const marketplaceFeeUpdatedAt = marketplaceRow?.updatedAt ?? null;

  // All paid/ever-charged orders for audit (including already populated).
  const orders = await prisma.order.findMany({
    where: {
      ...(sellerFilterId ? { sellerId: sellerFilterId } : {}),
      paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 10000,
    select: {
      id: true,
      createdAt: true,
      sellerId: true,
      itemPriceUsd: true,
      totalUsd: true,
      taxAmountCents: true,
      paymentStatus: true,
      platformFeeCents: true,
      platformFeePercentApplied: true,
      platformFeeBasisCents: true,
      platformFeePriorShowGmvUsd: true,
      platformFeeSellerOverrideApplied: true,
      stripeApplicationFeeCents: true,
      stripeProcessingFeeCents: true,
      listing: { select: { isCompanyListing: true } },
      seller: {
        select: {
          username: true,
          sellerPlatformFeePercentOverride: true,
          sellerPlatformFeeOverrideAt: true,
          sellerPlatformFeeOverrideExpiresAt: true,
        },
      },
      liveShippingSession: { select: { liveShowId: true } },
      variantPurchaseFulfillment: { select: { quantity: true } },
    },
  });

  const showIds = [
    ...new Set(
      orders
        .map((o) => o.liveShippingSession?.liveShowId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  // Full show sequences for prior-GMV (may include other statuses we already filtered).
  const showOrders =
    showIds.length === 0
      ? []
      : await prisma.order.findMany({
          where: {
            liveShippingSession: { liveShowId: { in: showIds } },
            paymentStatus: { in: ["paid", "layaway_completed", "refunded", "chargeback"] },
          },
          select: {
            id: true,
            createdAt: true,
            itemPriceUsd: true,
            paymentStatus: true,
            liveShippingSession: { select: { liveShowId: true } },
          },
        });

  const showOrdersByShow = new Map<
    string,
    Array<{ id: string; createdAt: Date; itemPriceUsd: number; paymentStatus: string }>
  >();
  for (const o of showOrders) {
    const sid = o.liveShippingSession?.liveShowId;
    if (!sid) continue;
    const list = showOrdersByShow.get(sid) ?? [];
    list.push({
      id: o.id,
      createdAt: o.createdAt,
      itemPriceUsd: o.itemPriceUsd,
      paymentStatus: o.paymentStatus,
    });
    showOrdersByShow.set(sid, list);
  }
  for (const [, list] of showOrdersByShow) {
    list.sort(compareOrderCompletion);
  }

  const sellerIds = [...new Set(orders.map((o) => o.sellerId))];
  const overrideEvents = await prisma.payoutEligibilityAuditLog.findMany({
    where: {
      sellerId: { in: sellerIds },
      action: { in: ["seller_platform_fee_override", "seller_platform_fee_override_cleared"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      sellerId: true,
      action: true,
      createdAt: true,
      newStatus: true,
      previousStatus: true,
    },
  });
  const overrideEventsBySeller = new Map<string, typeof overrideEvents>();
  for (const ev of overrideEvents) {
    const list = overrideEventsBySeller.get(ev.sellerId) ?? [];
    list.push(ev);
    overrideEventsBySeller.set(ev.sellerId, list);
  }

  const rows: PlatformFeeBackfillAuditRow[] = [];

  for (const o of orders) {
    const liveShowId = o.liveShippingSession?.liveShowId ?? null;
    const showList = liveShowId ? (showOrdersByShow.get(liveShowId) ?? []) : [];
    const priorGmv = liveShowId
      ? priorShowGmvUsdBeforeOrder({ orderId: o.id, showOrders: showList })
      : null;

    const sellerEvents = overrideEventsBySeller.get(o.sellerId) ?? [];
    const overrideFromAudit = sellerOverridePercentAt({
      events: sellerEvents.map((e) => ({
        action: e.action,
        createdAt: e.createdAt,
        newStatus: e.newStatus,
        previousStatus: e.previousStatus,
      })),
      at: o.createdAt,
    });
    const overrideProvenFromAudit = sellerEvents.some((e) => e.createdAt.getTime() <= o.createdAt.getTime());
    const overrideFallback = sellerOverridePercentAt({
      events: [],
      at: o.createdAt,
      currentOverridePercent: o.seller.sellerPlatformFeePercentOverride,
      currentOverrideAt: o.seller.sellerPlatformFeeOverrideAt,
      currentOverrideExpiresAt: o.seller.sellerPlatformFeeOverrideExpiresAt,
    });
    const sellerOverridePercentAtCharge = overrideFromAudit ?? overrideFallback;
    // Fallback without audit is not proven.
    const provenOverride = overrideFromAudit != null && overrideProvenFromAudit;

    const quantity = Math.max(1, o.variantPurchaseFulfillment?.quantity ?? 1);

    rows.push(
      classifyPlatformFeeBackfillRow({
        orderId: o.id,
        createdAt: o.createdAt,
        sellerId: o.sellerId,
        sellerHandle: o.seller.username,
        liveShowId,
        itemPriceUsd: o.itemPriceUsd,
        quantity,
        totalUsd: o.totalUsd,
        taxAmountCents: o.taxAmountCents,
        paymentStatus: o.paymentStatus,
        isCompanyListing: Boolean(o.listing.isCompanyListing),
        stripeApplicationFeeCents: o.stripeApplicationFeeCents,
        stripeProcessingFeeCents: o.stripeProcessingFeeCents,
        existingPlatformFeeCents: o.platformFeeCents,
        existingPlatformFeePercentApplied: o.platformFeePercentApplied,
        existingPlatformFeeBasisCents: o.platformFeeBasisCents,
        existingPlatformFeePriorShowGmvUsd: o.platformFeePriorShowGmvUsd,
        existingPlatformFeeSellerOverrideApplied: o.platformFeeSellerOverrideApplied,
        priorCompletedShowGmvUsd: priorGmv,
        sellerOverridePercentAtCharge,
        overrideProvenFromAudit: provenOverride,
        liveConfig: liveFee.config,
        liveConfigUpdatedAt: liveFee.updatedAt,
        marketplaceFeePercent,
        marketplaceFeeUpdatedAt,
      }),
    );
  }

  const summary = buildBackfillSummary(rows);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const scope = sellerFilterHandle ?? sellerFilterId ?? "all";
  const outBase = path.join(
    webRoot,
    "reports",
    `platform-fee-snapshot-backfill-${scope}-${stamp}`,
  );
  fs.mkdirSync(path.dirname(outBase), { recursive: true });

  const report = {
    mode: apply ? "APPLY" : "DRY_RUN_AUDIT",
    generatedAt: new Date().toISOString(),
    sellerScope: sellerFilterId
      ? { sellerId: sellerFilterId, sellerHandle: sellerFilterHandle }
      : null,
    liveShowFeeConfig: {
      ...liveFee.config,
      updatedAt: liveFee.updatedAt?.toISOString() ?? null,
      updatedByUserId: liveFee.updatedByUserId,
    },
    marketplaceFeePercent,
    marketplaceFeeUpdatedAt: marketplaceFeeUpdatedAt?.toISOString() ?? null,
    rules: [
      "Do not use stripeApplicationFeeCents as platformFeeCents",
      "Subtract Stripe processing when reconstructing from application_fee_amount",
      "Preserve legitimate historical 8% / 7.25% when Stripe evidence proves them",
      "Prior show GMV = sum of earlier same-show charged orders (createdAt+id), excluding unpaid/failed/canceled",
      "AMBIGUOUS_MANUAL_REVIEW and ESTIMATED_FROM_CURRENT_CONFIG are never written",
      "No Stripe charge / balance / payout mutations",
    ],
    summary,
    rows,
  };

  const jsonBody = JSON.stringify(report, null, 2);
  const jsonPath = `${outBase}.json`;
  fs.writeFileSync(jsonPath, jsonBody, "utf8");

  const sha256 = createHash("sha256").update(jsonBody).digest("hex");
  const shaPath = `${outBase}.sha256`;
  fs.writeFileSync(shaPath, `${sha256}\n`, "utf8");

  const csvHeader = [
    "orderId",
    "createdAt",
    "sellerId",
    "sellerHandle",
    "showOrLiveRoomId",
    "saleType",
    "itemSubtotalCents",
    "quantity",
    "platformFeeBasisCentsProposed",
    "priorCompletedShowGmvUsdProposed",
    "platformFeePercentAppliedProposed",
    "platformFeeCentsProposed",
    "sellerOverridePercentAtCharge",
    "sellerOverrideApplied",
    "stripeApplicationFeeCents",
    "stripeProcessingFeeCents",
    "existingPlatformFeeCents",
    "existingPlatformFeePercentApplied",
    "existingPlatformFeeBasisCents",
    "existingPlatformFeePriorShowGmvUsd",
    "existingPlatformFeeSellerOverrideApplied",
    "expectedFeeFromChargeEvidenceCents",
    "reconstructionSource",
    "confidence",
    "mismatchCents",
    "wouldWrite",
    "notes",
  ];
  const csvRows = rows.map((r) =>
    [
      r.orderId,
      r.createdAt,
      r.sellerId,
      r.sellerHandle,
      r.showOrLiveRoomId,
      r.saleType,
      r.itemSubtotalCents,
      r.quantity,
      r.platformFeeBasisCentsProposed,
      r.priorCompletedShowGmvUsdProposed,
      r.platformFeePercentAppliedProposed,
      r.platformFeeCentsProposed,
      r.sellerOverridePercentAtCharge,
      r.sellerOverrideApplied,
      r.stripeApplicationFeeCents,
      r.stripeProcessingFeeCents,
      r.existingPlatformFeeCents,
      r.existingPlatformFeePercentApplied,
      r.existingPlatformFeeBasisCents,
      r.existingPlatformFeePriorShowGmvUsd,
      r.existingPlatformFeeSellerOverrideApplied,
      r.expectedFeeFromChargeEvidenceCents,
      r.reconstructionSource,
      r.confidence,
      r.mismatchCents,
      r.wouldWrite,
      r.notes.join(" | "),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csvPath = `${outBase}.csv`;
  fs.writeFileSync(csvPath, [csvHeader.join(","), ...csvRows].join("\n"), "utf8");

  let written = 0;
  if (apply) {
    for (const r of rows) {
      if (!r.wouldWrite) continue;
      if (
        r.platformFeeCentsProposed == null ||
        r.platformFeePercentAppliedProposed == null ||
        r.platformFeeBasisCentsProposed == null
      ) {
        continue;
      }
      if (
        r.confidence !== "VERIFIED_FROM_STRIPE_AND_ORDER_DATA" &&
        r.confidence !== "RECONSTRUCTED_FROM_SHOW_SEQUENCE"
      ) {
        continue;
      }
      await persistOrderPlatformFeeSnapshot({
        orderId: r.orderId,
        snapshot: {
          platformFeeCents: r.platformFeeCentsProposed,
          platformFeePercentApplied: r.platformFeePercentAppliedProposed,
          platformFeeBasisCents: r.platformFeeBasisCentsProposed,
          platformFeePriorShowGmvUsd: r.priorCompletedShowGmvUsdProposed,
          platformFeeSellerOverrideApplied: r.sellerOverrideApplied,
        },
      });
      written += 1;
    }
  }

  const ambiguous = rows.filter((r) => r.confidence === "AMBIGUOUS_MANUAL_REVIEW");
  const not675 = rows.filter(
    (r) =>
      r.platformFeePercentAppliedProposed != null &&
      r.platformFeePercentAppliedProposed !== 6.75 &&
      r.confidence !== "SKIP_ALREADY_POPULATED",
  );
  const mismatchVsEvidence = rows.filter(
    (r) => r.mismatchCents != null && r.mismatchCents !== 0,
  );

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        summary,
        reportPaths: { jsonPath, csvPath, shaPath },
        sha256,
        writtenOnApply: written,
        ambiguousOrderIds: ambiguous.map((r) => r.orderId),
        ambiguousCount: ambiguous.length,
        non675Proposed: not675.map((r) => ({
          orderId: r.orderId,
          percent: r.platformFeePercentAppliedProposed,
          confidence: r.confidence,
          cents: r.platformFeeCentsProposed,
        })),
        mismatchVersusEvidence: mismatchVsEvidence.map((r) => ({
          orderId: r.orderId,
          mismatchCents: r.mismatchCents,
          proposed: r.platformFeeCentsProposed,
          evidence: r.expectedFeeFromChargeEvidenceCents,
          confidence: r.confidence,
        })),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
