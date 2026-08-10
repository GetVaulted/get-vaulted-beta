import type { Prisma } from "@/generated/prisma/client";
import { loadAdminFinanceCharts, loadAdminFinanceSummary } from "@/lib/admin/admin-finance-aggregates";
import {
  type CsvExportPayload,
  buildCsvExport,
  csvDownloadFilename,
  summaryRows,
} from "@/lib/admin/admin-csv";
import { loadAdminReconciliationReport, type ReconciliationRangeKey } from "@/lib/admin/admin-reconciliation";
import { prisma } from "@/lib/prisma";
import { effectiveOrderTaxAmountCents, aggregateTaxReporting, listSalesByStateReport } from "@/lib/sales-tax-reporting";
import { listTaxNexusStates } from "@/lib/stripe-tax";
import { listEscalatedRefundRequests, listStuckProcessingRefundRequests } from "@/services/order-refund-request";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";

export const ADMIN_EXPORT_REPORT_IDS = [
  "finance-summary",
  "finance-charts",
  "reconciliation",
  "tax-summary",
  "tax-sales-by-state",
  "tax-nexus",
  "orders",
  "seller-risk",
  "refund-requests",
  "live-shows",
  "giveaway-entrants",
] as const;

export type AdminExportReportId = (typeof ADMIN_EXPORT_REPORT_IDS)[number];

export function isAdminExportReportId(value: string): value is AdminExportReportId {
  return (ADMIN_EXPORT_REPORT_IDS as readonly string[]).includes(value);
}

export type AdminExportParams = {
  range?: string;
  period?: string;
  status?: string;
  tier?: string;
  pending?: string;
  from?: string;
  to?: string;
  campaignId?: string;
};

function centsToUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseDateParam(raw: string | undefined): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function reconciliationRange(raw: string | undefined): ReconciliationRangeKey {
  if (raw === "24h" || raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") return raw;
  return "30d";
}

function financePeriod(raw: string | undefined): "daily" | "weekly" | "monthly" {
  if (raw === "weekly" || raw === "monthly") return raw;
  return "daily";
}

function taxDateRangeKey(from?: Date, to?: Date): string {
  if (!from && !to) return "all-time";
  const f = from?.toISOString().slice(0, 10) ?? "start";
  const t = to?.toISOString().slice(0, 10) ?? "now";
  return `${f}_to_${t}`;
}

export async function buildAdminExportPayload(
  report: AdminExportReportId,
  params: AdminExportParams,
): Promise<CsvExportPayload> {
  switch (report) {
    case "finance-summary":
      return buildFinanceSummaryExport();
    case "finance-charts":
      return buildFinanceChartsExport(financePeriod(params.period));
    case "reconciliation":
      return buildReconciliationExport(reconciliationRange(params.range));
    case "tax-summary":
      return buildTaxSummaryExport();
    case "tax-sales-by-state":
      return buildTaxSalesByStateExport(parseDateParam(params.from), parseDateParam(params.to));
    case "tax-nexus":
      return buildTaxNexusExport();
    case "orders":
      return buildOrdersExport(params.status, parseDateParam(params.from), parseDateParam(params.to));
    case "seller-risk":
      return buildSellerRiskExport(params.tier, params.pending === "1");
    case "refund-requests":
      return buildRefundRequestsExport();
    case "live-shows":
      return buildLiveShowsExport(params.status);
    case "giveaway-entrants":
      return buildGiveawayEntrantsExport(params.campaignId);
    default: {
      const _exhaustive: never = report;
      throw new Error(`Unsupported export report: ${_exhaustive}`);
    }
  }
}

async function buildFinanceSummaryExport(): Promise<CsvExportPayload> {
  const s = await loadAdminFinanceSummary();
  return {
    filename: "finance-summary",
    headers: ["metric", "value"],
    rows: summaryRows({
      gmvUsd: s.gmvUsd ?? "",
      platformFeesUsd: s.platformFeesUsd ?? "",
      processingFeesUsd: s.processingFeesUsd ?? "",
      processingFeesEstimated: s.processingFeesEstimated,
      netRevenueUsd: s.netRevenueUsd ?? "",
      sellerPayoutsUsd: s.sellerPayoutsUsd ?? "",
      pendingPayoutsUsd: s.pendingPayoutsUsd ?? "",
      refundedOrders: s.refundedOrders ?? "",
      chargebacksDisputes: s.chargebacksDisputes ?? "",
      chargebacksDisputesEstimated: s.chargebacksDisputesEstimated,
      paidOrderCount: s.paidOrderCount,
      notes: s.notes.join(" | "),
    }),
  };
}

async function buildFinanceChartsExport(period: "daily" | "weekly" | "monthly"): Promise<CsvExportPayload> {
  const points = await loadAdminFinanceCharts(period);
  return {
    filename: `finance-charts-${period}`,
    headers: ["period", "label", "gmvUsd", "platformFeesUsd"],
    rows: points.map((p) => [period, p.label, p.gmvUsd, p.platformFeesUsd]),
  };
}

async function buildReconciliationExport(range: ReconciliationRangeKey): Promise<CsvExportPayload> {
  const r = await loadAdminReconciliationReport(range);
  const summary = summaryRows({
    rangeKey: r.rangeKey,
    rangeStart: r.rangeStart ?? "",
    generatedAt: r.generatedAt,
    paidOrderCount: r.paidOrderCount,
    refundedOrderCount: r.refundedOrderCount,
    grossSalesUsd: r.grossSalesUsd,
    gmvUsd: r.gmvUsd,
    platformRevenueUsd: r.platformRevenueUsd,
    processingFeesUsd: r.processingFeesUsd,
    salesTaxCollectedUsd: r.salesTaxCollectedUsd,
    shippingCollectedUsd: r.shippingCollectedUsd,
    shippingLabelCostUsd: r.shippingLabelCostUsd,
    sellerNetUsd: r.sellerNetUsd,
    companyNetRevenueUsd: r.companyNetRevenueUsd,
    refundedOrderCount_adjustments: r.refundAdjustments.refundedOrderCount,
    chargebackOrderCount: r.refundAdjustments.chargebackOrderCount,
    refundedGrossUsd: r.refundAdjustments.refundedGrossUsd,
    taxReversedUsd: r.refundAdjustments.taxReversedUsd,
    platformFeeOnRefundedOrdersUsd: r.refundAdjustments.platformFeeOnRefundedOrdersUsd,
    assumptions: r.assumptions.join(" | "),
  });

  const payoutRows = r.payoutStatusBreakdown.map((row) => [
    "payout_breakdown",
    row.status,
    row.orderCount,
    row.sellerNetUsd,
  ]);

  return {
    filename: `reconciliation-${range}`,
    headers: ["section", "metric_or_status", "value_or_count", "amountUsd"],
    rows: [
      ...summary.map(([metric, value]) => ["summary", metric, value, ""]),
      ...payoutRows,
    ],
  };
}

async function buildTaxSummaryExport(): Promise<CsvExportPayload> {
  const s = await aggregateTaxReporting({});
  const refunded = await aggregateTaxReporting({ refundedOnly: true });
  return {
    filename: "tax-summary",
    headers: ["section", "metric", "value"],
    rows: [
      ...summaryRows({
        taxCollectedCents: s.taxCollectedCents,
        taxCollectedUsd: centsToUsd(s.taxCollectedCents),
        taxRefundedCents: s.taxRefundedCents,
        netTaxDueCents: s.netTaxDueCents,
        netTaxDueUsd: centsToUsd(s.netTaxDueCents),
        taxableSalesCents: s.taxableSalesCents,
        nonTaxableSalesCents: s.nonTaxableSalesCents,
        orderCount: s.orderCount,
      }).map(([metric, value]) => ["collected", metric, value]),
      ...summaryRows({
        refundedOrderCount: refunded.orderCount,
        taxRefundedCents: refunded.taxRefundedCents,
        taxRefundedUsd: centsToUsd(refunded.taxRefundedCents),
      }).map(([metric, value]) => ["refunded", metric, value]),
    ],
  };
}

async function buildTaxSalesByStateExport(from?: Date, to?: Date): Promise<CsvExportPayload> {
  const report = await listSalesByStateReport({ from, to });
  return {
    filename: `tax-sales-by-state-${taxDateRangeKey(from, to)}`,
    headers: [
      "stateCode",
      "stateLabel",
      "totalGmvUsd",
      "taxableSalesUsd",
      "nonTaxableSalesUsd",
      "taxCollectedUsd",
      "orderCount",
      "collectionEnabled",
      "collectionBasis",
      "salesThresholdPercent",
      "transactionThresholdPercent",
      "nexusWatchLevel",
    ],
    rows: report.rows.map((r) => [
      r.stateCode,
      r.label,
      centsToUsd(r.totalGmvCents),
      centsToUsd(r.taxableSalesCents),
      centsToUsd(r.nonTaxableSalesCents),
      centsToUsd(r.taxCollectedCents),
      r.orderCount,
      r.collectionEnabled,
      r.collectionBasis ?? "",
      r.collectionEnabled ? "" : r.salesThresholdPercent.toFixed(1),
      r.collectionEnabled ? "" : r.transactionThresholdPercent.toFixed(1),
      r.nexusWatchLevel,
    ]),
  };
}

async function buildTaxNexusExport(): Promise<CsvExportPayload> {
  const states = await listTaxNexusStates();
  return {
    filename: "tax-nexus-states",
    headers: ["stateCode", "label", "enabled", "collectionBasis", "registeredAt", "notes"],
    rows: states.map((s) => [
      s.stateCode,
      s.label,
      s.enabled,
      s.collectionBasis,
      s.registeredAt?.toISOString() ?? "",
      s.notes ?? "",
    ]),
  };
}

/**
 * One Order per row, with the actual Stripe identifiers/amounts needed to match each row against
 * a Stripe activity export line-by-line — not just GV's own summary. Filters by `paidAt` (falling
 * back to `createdAt` only for rows not yet backfilled, matching prismaSaleAtFilter/
 * admin-reconciliation.ts) rather than `createdAt`, so the same window used for the 30-day
 * reconciliation report is the same window exported here.
 */
async function buildOrdersExport(
  statusRaw: string | undefined,
  from?: Date,
  to?: Date,
): Promise<CsvExportPayload> {
  const status = (statusRaw ?? "all").trim();
  const where: Prisma.OrderWhereInput = {};
  if (status !== "all" && status.length > 0) where.status = status;
  if (from || to) {
    const paidAt: { gte?: Date; lt?: Date } = {};
    const createdAt: { gte?: Date; lt?: Date } = {};
    if (from) {
      paidAt.gte = from;
      createdAt.gte = from;
    }
    if (to) {
      paidAt.lt = to;
      createdAt.lt = to;
    }
    where.OR = [{ paidAt }, { AND: [{ paidAt: null }, { createdAt }] }];
  }

  const rows = await prisma.order.findMany({
    where,
    include: {
      listing: { select: { id: true, title: true, status: true, isCompanyListing: true } },
      buyer: { select: { id: true, username: true, email: true } },
      seller: { select: { id: true, username: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  return {
    filename: status === "all" ? "orders" : `orders-${status}`,
    headers: [
      "orderId",
      "createdAt",
      "paidAt",
      "paidAtSource",
      "status",
      "paymentStatus",
      "fulfillmentStatus",
      "payoutStatus",
      "itemPriceUsd",
      "shippingPriceUsd",
      "taxUsd",
      "taxAmountCents",
      "totalUsd",
      "shipState",
      "shipCountry",
      "taxJurisdictionState",
      "stripePaymentIntentId",
      "stripeChargeId",
      "stripeBalanceTransactionId",
      "stripeProcessingFeeCents",
      "stripeTransferId",
      "stripeNetCents",
      "listingId",
      "listingTitle",
      "isCompanyListing",
      "buyerId",
      "buyerUsername",
      "buyerEmail",
      "sellerId",
      "sellerUsername",
      "sellerEmail",
    ],
    rows: rows.map((o) => [
      o.id,
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? "",
      // Never blank this out or infer it — null means genuinely undetermined (see the schema
      // comment on Order.paidAtSource), not "assume Stripe-verified".
      o.paidAtSource ?? "",
      o.status,
      o.paymentStatus,
      o.fulfillmentStatus,
      o.payoutStatus,
      o.itemPriceUsd,
      o.shippingPriceUsd,
      o.taxUsd,
      effectiveOrderTaxAmountCents(o),
      o.totalUsd,
      o.shipState,
      o.shipCountry,
      o.taxJurisdictionState ?? "",
      o.stripePaymentIntentId ?? "",
      o.stripeChargeId ?? "",
      o.stripeBalanceTransactionId ?? "",
      o.stripeProcessingFeeCents ?? "",
      o.stripeTransferId ?? "",
      o.stripeNetCents ?? "",
      o.listingId,
      o.listing.title,
      o.listing.isCompanyListing,
      o.buyerId,
      o.buyer.username,
      o.buyer.email,
      o.sellerId,
      o.seller.username,
      o.seller.email,
    ]),
  };
}

async function buildSellerRiskExport(tierRaw: string | undefined, pendingOnly: boolean): Promise<CsvExportPayload> {
  const tier = (tierRaw ?? "all").trim();
  const where: Prisma.UserWhereInput = { sellerSetupWizardCompletedAt: { not: null } };
  if (tier === "standard") where.payoutTier = "standard";
  if (tier === "fast") where.payoutTier = "fast";
  if (tier === "instant") where.payoutTier = "instant";
  if (pendingOnly) {
    where.OR = [{ fastPayoutStatus: "pending_approval" }, { instantPayoutApprovalStatus: "under_review" }];
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      payoutTier: true,
      fastPayoutStatus: true,
      instantPayoutApprovalStatus: true,
      instantPayoutStatus: true,
      instantPayoutEligible: true,
      payoutTierSuspensionReason: true,
      payoutTierSuspendedAt: true,
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
      stripeVerificationStatus: true,
      sellerLevel: true,
      payoutMetrics: {
        select: {
          lifetimeGmvUsd: true,
          cancellationRate: true,
          chargebackRate: true,
          disputeRate: true,
          accountStanding: true,
          outstandingInstantPayoutUsd: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  return {
    filename: pendingOnly ? "seller-risk-pending" : tier === "all" ? "seller-risk" : `seller-risk-${tier}`,
    headers: [
      "sellerId",
      "username",
      "email",
      "payoutTier",
      "fastPayoutStatus",
      "instantPayoutApprovalStatus",
      "instantPayoutStatus",
      "instantPayoutEligible",
      "suspensionReason",
      "suspendedAt",
      "stripeOnboardingComplete",
      "stripePayoutsEnabled",
      "stripeVerificationStatus",
      "sellerLevel",
      "lifetimeGmvUsd",
      "cancellationRate",
      "chargebackRate",
      "disputeRate",
      "accountStanding",
      "payoutExposureUsd",
    ],
    rows: rows.map((u) => [
      u.id,
      u.username,
      u.email,
      u.payoutTier,
      u.fastPayoutStatus,
      u.instantPayoutApprovalStatus,
      u.instantPayoutStatus,
      u.instantPayoutEligible,
      u.payoutTierSuspensionReason ?? "",
      u.payoutTierSuspendedAt?.toISOString() ?? "",
      u.stripeOnboardingComplete,
      u.stripePayoutsEnabled,
      u.stripeVerificationStatus ?? "",
      u.sellerLevel,
      u.payoutMetrics?.lifetimeGmvUsd ?? "",
      u.payoutMetrics?.cancellationRate ?? "",
      u.payoutMetrics?.chargebackRate ?? "",
      u.payoutMetrics?.disputeRate ?? "",
      u.payoutMetrics?.accountStanding ?? "",
      u.payoutMetrics?.outstandingInstantPayoutUsd ?? "",
    ]),
  };
}

async function buildRefundRequestsExport(): Promise<CsvExportPayload> {
  const [requests, stuckRequests] = await Promise.all([
    listEscalatedRefundRequests(500),
    listStuckProcessingRefundRequests(500),
  ]);

  return {
    filename: "refund-requests",
    headers: [
      "queue",
      "requestId",
      "orderId",
      "orderTotalUsd",
      "listingTitle",
      "buyerUsername",
      "sellerUsername",
      "kind",
      "status",
      "reason",
      "sellerDenyReason",
      "escalatedAt",
      "createdAt",
      "stuckForMinutes",
    ],
    rows: [
      ...requests.map((r) => [
        "escalated",
        r.id,
        r.orderId,
        r.orderTotalUsd,
        r.listingTitle,
        r.buyerUsername,
        r.sellerUsername,
        r.kind,
        r.status,
        r.reason,
        r.sellerDenyReason ?? "",
        r.escalatedAt ?? "",
        r.createdAt,
        "",
      ]),
      ...stuckRequests.map((r) => [
        "stuck_processing",
        r.id,
        r.orderId,
        r.orderTotalUsd,
        r.listingTitle,
        r.buyerUsername,
        r.sellerUsername,
        r.kind,
        r.status,
        r.reason,
        r.sellerDenyReason ?? "",
        r.escalatedAt ?? "",
        r.createdAt,
        Math.round(r.stuckForMs / 60000),
      ]),
    ],
  };
}

async function buildLiveShowsExport(statusRaw: string | undefined): Promise<CsvExportPayload> {
  const status = (statusRaw ?? "all").trim();
  const where =
    status === "live"
      ? { status: "live" as const }
      : status === "scheduled"
        ? { status: "scheduled" as const }
        : status === "ended"
          ? { status: "ended" as const }
          : {};

  const rooms = await prisma.liveRoom.findMany({
    where,
    include: {
      seller: { select: { username: true, email: true } },
      items: { select: { status: true } },
      _count: { select: { roomBids: true, reports: true } },
    },
    orderBy: [{ status: "asc" }, { scheduledStartAt: "desc" }, { startedAt: "desc" }],
    take: 500,
  });

  return {
    filename: status === "all" ? "live-shows" : `live-shows-${status}`,
    headers: [
      "showId",
      "title",
      "status",
      "hostUsername",
      "hostEmail",
      "viewerCount",
      "bidCount",
      "reportCount",
      "completedSalesGmvUsd",
      "soldItemCount",
      "queuedItemCount",
      "streamHealth",
      "streamMode",
      "scheduledStartAt",
      "startedAt",
      "endedAt",
      "lastIvsError",
    ],
    rows: rooms.map((r) => [
      r.id,
      r.title,
      r.status,
      r.seller.username,
      r.seller.email,
      r.viewerCount,
      r._count.roomBids,
      r._count.reports,
      liveShowGmvForFeeTierReconstruction(r) ?? r.completedSalesGmvUsd,
      r.items.filter((i) => i.status === "sold").length,
      r.items.filter((i) => i.status === "queued").length,
      r.streamHealth,
      r.streamMode,
      r.scheduledStartAt?.toISOString() ?? "",
      r.startedAt?.toISOString() ?? "",
      r.endedAt?.toISOString() ?? "",
      r.lastIvsError ?? "",
    ]),
  };
}

async function buildGiveawayEntrantsExport(campaignId: string | undefined): Promise<CsvExportPayload> {
  if (!campaignId?.trim()) {
    throw new Error("campaignId required for giveaway-entrants export");
  }
  const id = campaignId.trim();
  const campaign = await prisma.giveawayCampaign.findUnique({
    where: { id },
    select: { slug: true, title: true },
  });
  const grouped = await prisma.giveawayEntryLedger.groupBy({
    by: ["userId"],
    where: { campaignId: id },
    _sum: { quantity: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, username: true, email: true, emailVerified: true, createdAt: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = grouped
    .map((g) => {
      const u = byId.get(g.userId);
      return [
        g.userId,
        u?.username ?? "",
        u?.email ?? "",
        u?.emailVerified?.toISOString() ?? "",
        u?.createdAt.toISOString() ?? "",
        String(g._sum.quantity ?? 0),
      ];
    })
    .sort((a, b) => Number(b[5]) - Number(a[5]));

  return {
    filename: `giveaway-entrants-${campaign?.slug ?? id}`,
    headers: ["userId", "username", "email", "emailVerified", "accountCreatedAt", "totalEntries"],
    rows,
  };
}

export function adminExportCsvResponse(payload: CsvExportPayload): Response {
  const body = buildCsvExport(payload);
  const generatedAt = new Date();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvDownloadFilename(payload.filename, generatedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
