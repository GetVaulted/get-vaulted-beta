import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOrderTaxPersistFields, orderTaxUpdateData } from "@/lib/sales-tax-order";
import { fetchPaymentIntentTax, normalizeCountryCode, normalizeUsStateCode } from "@/lib/stripe-tax";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Prefer persisted cents; fall back to legacy taxUsd on older rows. */
export function effectiveOrderTaxAmountCents(order: {
  taxAmountCents?: number | null;
  taxUsd?: number | null;
}): number {
  const cents = Math.max(0, order.taxAmountCents ?? 0);
  if (cents > 0) return cents;
  const fromUsd = Math.round(Math.max(0, order.taxUsd ?? 0) * 100);
  return fromUsd > 0 ? fromUsd : 0;
}

/** Informational nexus monitoring — does NOT auto-enable tax collection. */
export async function recordTaxDestinationVolumeOnOrderPaid(args: {
  shipState: string;
  shipCountry: string;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxAmountCents: number;
  paidAt?: Date;
}): Promise<void> {
  const stateCode = normalizeUsStateCode(args.shipState);
  if (!stateCode || normalizeCountryCode(args.shipCountry) !== "US") return;

  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, args.shippingPriceUsd) * 100);
  const subtotalCents = itemCents + shippingCents;
  const taxCents = Math.max(0, Math.round(args.taxAmountCents));
  const taxableSalesCents = taxCents > 0 ? subtotalCents : 0;
  const nonTaxableSalesCents = taxCents > 0 ? 0 : subtotalCents;
  const orderDate = startOfUtcDay(args.paidAt ?? new Date());

  await prisma.taxDestinationVolumeDaily.upsert({
    where: { stateCode_orderDate: { stateCode, orderDate } },
    create: {
      stateCode,
      orderDate,
      taxableSalesCents,
      nonTaxableSalesCents,
      taxCollectedCents: taxCents,
      orderCount: 1,
    },
    update: {
      taxableSalesCents: { increment: taxableSalesCents },
      nonTaxableSalesCents: { increment: nonTaxableSalesCents },
      taxCollectedCents: { increment: taxCents },
      orderCount: { increment: 1 },
    },
  });
}

export type TaxReportingFilters = {
  stateCode?: string;
  from?: Date;
  to?: Date;
  sellerId?: string;
  refundedOnly?: boolean;
};

export type TaxReportingSummary = {
  taxCollectedCents: number;
  taxRefundedCents: number;
  netTaxDueCents: number;
  taxableSalesCents: number;
  nonTaxableSalesCents: number;
  shippingTaxableCents: number;
  orderCount: number;
};

export async function aggregateTaxReporting(filters: TaxReportingFilters): Promise<TaxReportingSummary> {
  const where: Prisma.OrderWhereInput = {
    paymentStatus: filters.refundedOnly ? "refunded" : { in: ["paid", "refunded"] },
  };

  if (filters.stateCode) {
    where.taxJurisdictionState = normalizeUsStateCode(filters.stateCode) ?? filters.stateCode;
  }
  if (filters.sellerId) where.sellerId = filters.sellerId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const orders = await prisma.order.findMany({
    where,
    select: {
      taxAmountCents: true,
      taxUsd: true,
      taxRefundedCents: true,
      taxTaxableSubtotalCents: true,
      taxShippingTaxableCents: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
    },
  });

  let taxCollectedCents = 0;
  let taxRefundedCents = 0;
  let taxableSalesCents = 0;
  let nonTaxableSalesCents = 0;
  let shippingTaxableCents = 0;

  for (const o of orders) {
    const tax = effectiveOrderTaxAmountCents(o);
    const refunded = Math.max(0, o.taxRefundedCents ?? 0);
    taxCollectedCents += tax;
    taxRefundedCents += refunded;
    if (tax > 0) {
      const itemCents =
        o.taxTaxableSubtotalCents && o.taxTaxableSubtotalCents > 0
          ? o.taxTaxableSubtotalCents
          : Math.round(Math.max(0, o.itemPriceUsd) * 100);
      const shipCents =
        o.taxShippingTaxableCents && o.taxShippingTaxableCents > 0
          ? o.taxShippingTaxableCents
          : Math.round(Math.max(0, o.shippingPriceUsd) * 100);
      taxableSalesCents += itemCents;
      shippingTaxableCents += shipCents;
    } else {
      const subtotal =
        (o.taxTaxableSubtotalCents ?? 0) + (o.taxShippingTaxableCents ?? 0) ||
        Math.round(Math.max(0, o.itemPriceUsd + o.shippingPriceUsd) * 100);
      nonTaxableSalesCents += subtotal > 0 ? subtotal : 0;
    }
  }

  return {
    taxCollectedCents,
    taxRefundedCents,
    netTaxDueCents: Math.max(0, taxCollectedCents - taxRefundedCents),
    taxableSalesCents,
    nonTaxableSalesCents,
    shippingTaxableCents,
    orderCount: orders.length,
  };
}

/** Common economic nexus thresholds (many states; verify per state before registering). */
export const ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS = 10_000_000;
export const ECONOMIC_NEXUS_TRANSACTION_THRESHOLD = 200;

export type NexusWatchLevel = "none" | "approaching" | "exceeded";

export type SalesByStateRow = {
  stateCode: string;
  label: string;
  totalGmvCents: number;
  taxableSalesCents: number;
  nonTaxableSalesCents: number;
  taxCollectedCents: number;
  orderCount: number;
  collectionEnabled: boolean;
  collectionBasis: string | null;
  salesThresholdPercent: number;
  transactionThresholdPercent: number;
  nexusWatchLevel: NexusWatchLevel;
};

export type SalesByStateReport = {
  rows: SalesByStateRow[];
  totals: {
    totalGmvCents: number;
    taxableSalesCents: number;
    nonTaxableSalesCents: number;
    taxCollectedCents: number;
    orderCount: number;
    statesWithSales: number;
  };
  thresholds: {
    salesThresholdCents: number;
    transactionThreshold: number;
    note: string;
  };
  filters: { from: string | null; to: string | null };
};

export function resolveNexusWatchLevel(args: {
  totalGmvCents: number;
  orderCount: number;
  collectionEnabled: boolean;
  salesThresholdCents?: number;
  transactionThreshold?: number;
}): { level: NexusWatchLevel; salesThresholdPercent: number; transactionThresholdPercent: number } {
  if (args.collectionEnabled) {
    return { level: "none", salesThresholdPercent: 0, transactionThresholdPercent: 0 };
  }

  const salesThresholdCents = args.salesThresholdCents ?? ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS;
  const transactionThreshold = args.transactionThreshold ?? ECONOMIC_NEXUS_TRANSACTION_THRESHOLD;
  const salesThresholdPercent =
    salesThresholdCents > 0 ? (args.totalGmvCents / salesThresholdCents) * 100 : 0;
  const transactionThresholdPercent =
    transactionThreshold > 0 ? (args.orderCount / transactionThreshold) * 100 : 0;

  const salesExceeded = args.totalGmvCents >= salesThresholdCents;
  const transactionsExceeded = args.orderCount >= transactionThreshold;
  if (salesExceeded || transactionsExceeded) {
    return { level: "exceeded", salesThresholdPercent, transactionThresholdPercent };
  }

  const salesApproaching = salesThresholdPercent >= 75;
  const transactionsApproaching = transactionThresholdPercent >= 75;
  if (salesApproaching || transactionsApproaching) {
    return { level: "approaching", salesThresholdPercent, transactionThresholdPercent };
  }

  return { level: "none", salesThresholdPercent, transactionThresholdPercent };
}

export async function listNexusMonitoringByState(args?: { from?: Date; to?: Date }) {
  const where: Prisma.TaxDestinationVolumeDailyWhereInput = {};
  if (args?.from || args?.to) {
    where.orderDate = {};
    if (args.from) where.orderDate.gte = startOfUtcDay(args.from);
    if (args.to) where.orderDate.lte = startOfUtcDay(args.to);
  }

  const rows = await prisma.taxDestinationVolumeDaily.groupBy({
    by: ["stateCode"],
    where,
    _sum: {
      taxableSalesCents: true,
      nonTaxableSalesCents: true,
      taxCollectedCents: true,
      orderCount: true,
    },
    orderBy: { stateCode: "asc" },
  });

  const enabled = await prisma.taxNexusState.findMany({
    select: { stateCode: true, enabled: true, collectionBasis: true },
  });
  const enabledMap = new Map(enabled.map((e) => [e.stateCode, e]));

  return rows.map((r) => ({
    stateCode: r.stateCode,
    taxableSalesCents: r._sum.taxableSalesCents ?? 0,
    nonTaxableSalesCents: r._sum.nonTaxableSalesCents ?? 0,
    taxCollectedCents: r._sum.taxCollectedCents ?? 0,
    orderCount: r._sum.orderCount ?? 0,
    collectionEnabled: enabledMap.get(r.stateCode)?.enabled ?? false,
    collectionBasis: enabledMap.get(r.stateCode)?.collectionBasis ?? null,
  }));
}

/** Full sales-by-state report for admin nexus monitoring. */
export async function listSalesByStateReport(args?: { from?: Date; to?: Date }): Promise<SalesByStateReport> {
  const [volumeRows, nexusStates] = await Promise.all([
    listNexusMonitoringByState(args),
    prisma.taxNexusState.findMany({
      select: { stateCode: true, label: true, enabled: true, collectionBasis: true },
      orderBy: { stateCode: "asc" },
    }),
  ]);

  const volumeMap = new Map(volumeRows.map((r) => [r.stateCode, r]));
  const stateCodes = new Set<string>([
    ...nexusStates.map((s) => s.stateCode),
    ...volumeRows.map((r) => r.stateCode),
  ]);

  const rows: SalesByStateRow[] = [...stateCodes].map((stateCode) => {
    const nexus = nexusStates.find((s) => s.stateCode === stateCode);
    const volume = volumeMap.get(stateCode);
    const taxableSalesCents = volume?.taxableSalesCents ?? 0;
    const nonTaxableSalesCents = volume?.nonTaxableSalesCents ?? 0;
    const totalGmvCents = taxableSalesCents + nonTaxableSalesCents;
    const orderCount = volume?.orderCount ?? 0;
    const collectionEnabled = nexus?.enabled ?? volume?.collectionEnabled ?? false;
    const watch = resolveNexusWatchLevel({
      totalGmvCents,
      orderCount,
      collectionEnabled,
    });

    return {
      stateCode,
      label: nexus?.label ?? stateCode,
      totalGmvCents,
      taxableSalesCents,
      nonTaxableSalesCents,
      taxCollectedCents: volume?.taxCollectedCents ?? 0,
      orderCount,
      collectionEnabled,
      collectionBasis: nexus?.collectionBasis ?? volume?.collectionBasis ?? null,
      salesThresholdPercent: watch.salesThresholdPercent,
      transactionThresholdPercent: watch.transactionThresholdPercent,
      nexusWatchLevel: watch.level,
    };
  });

  rows.sort((a, b) => {
    if (b.totalGmvCents !== a.totalGmvCents) return b.totalGmvCents - a.totalGmvCents;
    if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
    return a.stateCode.localeCompare(b.stateCode);
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalGmvCents += row.totalGmvCents;
      acc.taxableSalesCents += row.taxableSalesCents;
      acc.nonTaxableSalesCents += row.nonTaxableSalesCents;
      acc.taxCollectedCents += row.taxCollectedCents;
      acc.orderCount += row.orderCount;
      if (row.totalGmvCents > 0 || row.orderCount > 0) acc.statesWithSales += 1;
      return acc;
    },
    {
      totalGmvCents: 0,
      taxableSalesCents: 0,
      nonTaxableSalesCents: 0,
      taxCollectedCents: 0,
      orderCount: 0,
      statesWithSales: 0,
    },
  );

  return {
    rows,
    totals,
    thresholds: {
      salesThresholdCents: ECONOMIC_NEXUS_SALES_THRESHOLD_CENTS,
      transactionThreshold: ECONOMIC_NEXUS_TRANSACTION_THRESHOLD,
      note: "Reference thresholds only — economic nexus rules vary by state. Confirm with your tax advisor before registering.",
    },
    filters: {
      from: args?.from?.toISOString() ?? null,
      to: args?.to?.toISOString() ?? null,
    },
  };
}

/** Repair missing tax cents on paid orders and rebuild destination volume monitor rows. */
export async function syncTaxReportingFromPaidOrders(): Promise<{
  ordersRepaired: number;
  volumeRowsWritten: number;
}> {
  const candidates = await prisma.order.findMany({
    where: {
      paymentStatus: { in: ["paid", "refunded"] },
      OR: [{ taxAmountCents: 0 }, { taxUsd: { gt: 0 } }],
    },
    select: {
      id: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
      stripeTaxCalculationId: true,
      stripePaymentIntentId: true,
      shipState: true,
      taxJurisdictionState: true,
      taxCollectionBasis: true,
    },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  let ordersRepaired = 0;
  for (const order of candidates) {
    let taxAmountCents = effectiveOrderTaxAmountCents(order);
    let stripeTaxCalculationId = order.stripeTaxCalculationId ?? null;

    if (taxAmountCents <= 0 && order.stripePaymentIntentId) {
      const fromPi = await fetchPaymentIntentTax(order.stripePaymentIntentId);
      if (fromPi && fromPi.taxAmountCents > 0) {
        taxAmountCents = fromPi.taxAmountCents;
        stripeTaxCalculationId = fromPi.stripeTaxCalculationId ?? stripeTaxCalculationId;
      }
    }

    if (taxAmountCents <= 0) continue;
    if (order.taxAmountCents === taxAmountCents && order.taxUsd >= taxAmountCents / 100 - 0.001) continue;

    await prisma.order.update({
      where: { id: order.id },
      data: orderTaxUpdateData(
        buildOrderTaxPersistFields({
          itemPriceUsd: order.itemPriceUsd,
          shippingPriceUsd: order.shippingPriceUsd,
          taxAmountCents,
          stripeTaxCalculationId,
          taxJurisdictionState: order.taxJurisdictionState ?? order.shipState,
          taxCollectionBasis: (order.taxCollectionBasis as "marketplace_facilitator" | null) ?? null,
        }),
      ),
    });
    ordersRepaired += 1;
  }

  await prisma.taxDestinationVolumeDaily.deleteMany({});

  const paidOrders = await prisma.order.findMany({
    where: { paymentStatus: { in: ["paid", "refunded"] } },
    select: {
      shipState: true,
      shipCountry: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxAmountCents: true,
      taxUsd: true,
      createdAt: true,
    },
  });

  for (const order of paidOrders) {
    const taxAmountCents = effectiveOrderTaxAmountCents(order);
    await recordTaxDestinationVolumeOnOrderPaid({
      shipState: order.shipState,
      shipCountry: order.shipCountry,
      itemPriceUsd: order.itemPriceUsd,
      shippingPriceUsd: order.shippingPriceUsd,
      taxAmountCents,
      paidAt: order.createdAt,
    });
  }

  const volumeRowsWritten = await prisma.taxDestinationVolumeDaily.count();
  return { ordersRepaired, volumeRowsWritten };
}
