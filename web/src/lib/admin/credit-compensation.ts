import { prisma } from "@/lib/prisma";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";

/**
 * Seller compensation for buyer-spent credit (Get Vaulted credit + referral credit).
 *
 * The buyer's card is charged less, but the seller's fee and payout are computed on the full sale
 * price. Part of the gap is absorbed by lowering Get Vaulted's platform fee on the order; whatever
 * is left (credit minus fee minus processing) is a real shortfall in the seller's Stripe balance.
 * `fundSellerCreditShortfallIfNeeded` used to top that up automatically but is switched off, so this
 * module lets an admin see what is still owed and record when it has been paid.
 *
 * The shortfall formula mirrors `fund-seller-credit-shortfall.ts` exactly.
 */

export type CreditKind = "all" | "platform" | "referral";

export type CreditCompStatus =
  /** A top-up transfer is recorded on the order. */
  | "compensated"
  /** The old automatic top-up tried and failed. */
  | "failed"
  /** Credit is bigger than the fee + processing: the seller is short and nothing is recorded yet. */
  | "owed"
  /** The platform fee absorbed all of the credit, so the seller lost nothing. */
  | "fee_covers"
  /** PayPal / escrow orders are paid from the full sale price directly, so there is no gap. */
  | "not_applicable";

export function estimateCreditShortfallCents(o: {
  platformCreditAppliedUsd?: number | null;
  referralCreditAppliedUsd?: number | null;
  platformFeeCents?: number | null;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd?: number | null;
}): number {
  const creditCents =
    Math.round(Math.max(0, o.platformCreditAppliedUsd ?? 0) * 100) +
    Math.round(Math.max(0, o.referralCreditAppliedUsd ?? 0) * 100);
  if (creditCents < 1) return 0;
  const platformFeeCents = Math.max(0, o.platformFeeCents ?? 0);
  const amountCents = Math.round(Math.max(0, o.itemPriceUsd + o.shippingPriceUsd + (o.taxUsd ?? 0)) * 100);
  const processingFeeCents = platformFeeCents > 0 ? estimateStripeProcessingFeeCents(amountCents) : 0;
  return Math.max(0, creditCents - platformFeeCents - processingFeeCents);
}

export function creditCompensationStatus(o: {
  shortfallEstimateCents: number;
  fundedAt: Date | null;
  failedAt: Date | null;
  sellerPayoutProcessor: string | null;
  paymentMethod: string | null;
}): CreditCompStatus {
  if (o.fundedAt) return "compensated";
  if (o.sellerPayoutProcessor === "PAYPAL" || o.paymentMethod === "escrow") return "not_applicable";
  if (o.shortfallEstimateCents < 1) return "fee_covers";
  return o.failedAt ? "failed" : "owed";
}

export const CREDIT_COMP_STATUS_LABEL: Record<CreditCompStatus, string> = {
  compensated: "Compensated",
  failed: "Owed (auto top-up failed)",
  owed: "Owed",
  fee_covers: "Covered by fee",
  not_applicable: "No gap",
};

export type CreditCompRow = {
  id: string;
  createdAt: Date;
  sellerId: string;
  seller: string;
  buyer: string;
  platformCreditUsd: number;
  referralCreditUsd: number;
  platformFeeCents: number;
  shortfallCents: number;
  status: CreditCompStatus;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  transferId: string | null;
  fundedAt: Date | null;
  live: boolean;
};

export type CreditCompSellerTotal = { sellerId: string; seller: string; owedCents: number; orders: number };

export type CreditCompSummary = {
  platformCreditUsd: number;
  referralCreditUsd: number;
  owedCents: number;
  compensatedCents: number;
  owedOrders: number;
};

const MAX_ROWS = 500;

export async function loadCreditCompensation(args: {
  kind: CreditKind;
  days: number | null;
}): Promise<{ rows: CreditCompRow[]; sellers: CreditCompSellerTotal[]; summary: CreditCompSummary; truncated: boolean }> {
  const creditFilter =
    args.kind === "platform"
      ? { platformCreditAppliedUsd: { gt: 0 } }
      : args.kind === "referral"
        ? { referralCreditAppliedUsd: { gt: 0 } }
        : { OR: [{ platformCreditAppliedUsd: { gt: 0 } }, { referralCreditAppliedUsd: { gt: 0 } }] };

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      ...creditFilter,
      ...(args.days ? { createdAt: { gte: new Date(Date.now() - args.days * 24 * 60 * 60 * 1000) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      sellerId: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      platformCreditAppliedUsd: true,
      referralCreditAppliedUsd: true,
      platformFeeCents: true,
      paymentMethod: true,
      sellerPayoutProcessor: true,
      payoutStatus: true,
      payoutBlockedReason: true,
      sellerCreditShortfallTransferId: true,
      sellerCreditShortfallFundedAt: true,
      sellerCreditShortfallFailedAt: true,
      sellerCreditShortfallCents: true,
      liveShippingSessionId: true,
      seller: { select: { username: true } },
      buyer: { select: { username: true } },
    },
  });

  const truncated = orders.length > MAX_ROWS;
  const rows: CreditCompRow[] = orders.slice(0, MAX_ROWS).map((o) => {
    const estimate = estimateCreditShortfallCents(o);
    const status = creditCompensationStatus({
      shortfallEstimateCents: estimate,
      fundedAt: o.sellerCreditShortfallFundedAt,
      failedAt: o.sellerCreditShortfallFailedAt,
      sellerPayoutProcessor: o.sellerPayoutProcessor ?? null,
      paymentMethod: o.paymentMethod ?? null,
    });
    return {
      id: o.id,
      createdAt: o.createdAt,
      sellerId: o.sellerId,
      seller: o.seller.username ?? o.sellerId,
      buyer: o.buyer.username ?? "unknown",
      platformCreditUsd: o.platformCreditAppliedUsd ?? 0,
      referralCreditUsd: o.referralCreditAppliedUsd ?? 0,
      platformFeeCents: o.platformFeeCents ?? 0,
      shortfallCents: o.sellerCreditShortfallFundedAt ? (o.sellerCreditShortfallCents ?? estimate) : estimate,
      status,
      payoutStatus: String(o.payoutStatus),
      payoutBlockedReason: o.payoutBlockedReason ?? null,
      transferId: o.sellerCreditShortfallTransferId ?? null,
      fundedAt: o.sellerCreditShortfallFundedAt ?? null,
      live: Boolean(o.liveShippingSessionId),
    };
  });

  const bySeller = new Map<string, CreditCompSellerTotal>();
  const summary: CreditCompSummary = {
    platformCreditUsd: 0,
    referralCreditUsd: 0,
    owedCents: 0,
    compensatedCents: 0,
    owedOrders: 0,
  };
  for (const r of rows) {
    summary.platformCreditUsd += r.platformCreditUsd;
    summary.referralCreditUsd += r.referralCreditUsd;
    if (r.status === "owed" || r.status === "failed") {
      summary.owedCents += r.shortfallCents;
      summary.owedOrders += 1;
      const cur = bySeller.get(r.sellerId) ?? { sellerId: r.sellerId, seller: r.seller, owedCents: 0, orders: 0 };
      cur.owedCents += r.shortfallCents;
      cur.orders += 1;
      bySeller.set(r.sellerId, cur);
    } else if (r.status === "compensated") {
      summary.compensatedCents += r.shortfallCents;
    }
  }
  summary.platformCreditUsd = Math.round(summary.platformCreditUsd * 100) / 100;
  summary.referralCreditUsd = Math.round(summary.referralCreditUsd * 100) / 100;

  return {
    rows,
    sellers: [...bySeller.values()].sort((a, b) => b.owedCents - a.owedCents),
    summary,
    truncated,
  };
}
