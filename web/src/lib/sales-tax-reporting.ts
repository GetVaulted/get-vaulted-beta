import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCountryCode, normalizeUsStateCode } from "@/lib/stripe-tax";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
      taxRefundedCents: true,
      taxTaxableSubtotalCents: true,
      taxShippingTaxableCents: true,
    },
  });

  let taxCollectedCents = 0;
  let taxRefundedCents = 0;
  let taxableSalesCents = 0;
  let nonTaxableSalesCents = 0;
  let shippingTaxableCents = 0;

  for (const o of orders) {
    const tax = Math.max(0, o.taxAmountCents ?? 0);
    const refunded = Math.max(0, o.taxRefundedCents ?? 0);
    taxCollectedCents += tax;
    taxRefundedCents += refunded;
    if (tax > 0) {
      taxableSalesCents += o.taxTaxableSubtotalCents ?? 0;
      shippingTaxableCents += o.taxShippingTaxableCents ?? 0;
    } else {
      const subtotal = (o.taxTaxableSubtotalCents ?? 0) + (o.taxShippingTaxableCents ?? 0);
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
