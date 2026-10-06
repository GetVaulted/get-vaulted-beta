import { applicationFeeCentsFromSubtotalUsd, platformFeeBaseUsd } from "@/lib/platform-fee-policy";
import { estimateStripeProcessingFeeCents } from "@/lib/seller-payout-estimate";
import type { LiveShowFeeConfig } from "@/services/live-show-fee-settings";

/** Seed / code-default live tiers (migration 20260626190000) — known prior to admin 6.75% cutover. */
export const HISTORICAL_LIVE_SHOW_FEE_DEFAULTS: LiveShowFeeConfig = {
  tier1FeePercent: 8,
  tier2ThresholdUsd: 1000,
  tier2FeePercent: 7.25,
  tier3ThresholdUsd: 3000,
  tier3FeePercent: 6.5,
};

export type FeeSnapshotConfidence =
  | "VERIFIED_FROM_PERSISTED_CHARGE_DATA"
  | "VERIFIED_FROM_STRIPE_AND_ORDER_DATA"
  | "RECONSTRUCTED_FROM_SHOW_SEQUENCE"
  | "ESTIMATED_FROM_CURRENT_CONFIG"
  | "AMBIGUOUS_MANUAL_REVIEW"
  | "SKIP_ALREADY_POPULATED";

export type PlatformFeeBackfillAuditRow = {
  orderId: string;
  createdAt: string;
  sellerId: string;
  sellerHandle: string | null;
  showOrLiveRoomId: string | null;
  saleType: "live" | "marketplace";
  itemSubtotalCents: number;
  quantity: number;
  platformFeeBasisCentsProposed: number | null;
  priorCompletedShowGmvUsdProposed: number | null;
  platformFeePercentAppliedProposed: number | null;
  platformFeeCentsProposed: number | null;
  sellerOverridePercentAtCharge: number | null;
  sellerOverrideApplied: boolean;
  stripeApplicationFeeCents: number | null;
  stripeProcessingFeeCents: number | null;
  existingPlatformFeeCents: number | null;
  existingPlatformFeePercentApplied: number | null;
  existingPlatformFeeBasisCents: number | null;
  existingPlatformFeePriorShowGmvUsd: number | null;
  existingPlatformFeeSellerOverrideApplied: boolean;
  expectedFeeFromChargeEvidenceCents: number | null;
  reconstructionSource: string;
  confidence: FeeSnapshotConfidence;
  mismatchCents: number | null;
  wouldWrite: boolean;
  notes: string[];
};

export type PlatformFeeBackfillSummary = {
  totalCandidates: number;
  alreadyPopulated: number;
  verified: number;
  reconstructedHighConfidence: number;
  ambiguousManualReview: number;
  estimatedFromCurrentConfig: number;
  proposed675Rows: number;
  proposed575Rows: number;
  proposed500Rows: number;
  legitimateHistorical8Rows: number;
  legitimateHistorical725Rows: number;
  totalProposedPlatformFeeCents: number;
  totalMismatchVersusEvidenceCents: number;
  writableOnApply: number;
};

/** Statuses that ever successfully charged and contributed to show GMV at some point. */
export function orderEverCountedTowardShowGmv(paymentStatus: string): boolean {
  const s = paymentStatus.trim().toLowerCase();
  return s === "paid" || s === "layaway_completed" || s === "refunded" || s === "chargeback";
}

export function compareOrderCompletion(
  a: { createdAt: Date; id: string },
  b: { createdAt: Date; id: string },
): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

export function liveShowFeePercentForGmv(gmvUsd: number, config: LiveShowFeeConfig): number {
  const gmv = Math.max(0, gmvUsd);
  if (gmv >= config.tier3ThresholdUsd) return config.tier3FeePercent;
  if (gmv >= config.tier2ThresholdUsd) return config.tier2FeePercent;
  return config.tier1FeePercent;
}

/**
 * Resolve fee config that applied at charge time.
 * Orders at/after PlatformLiveShowFeeConfig.updatedAt use the current DB row (proven).
 * Orders before that use seed defaults (proven as the only known prior row).
 */
export function resolveLiveShowFeeConfigAsOf(args: {
  orderCreatedAt: Date;
  currentConfig: LiveShowFeeConfig;
  currentConfigUpdatedAt: Date | null;
}): { config: LiveShowFeeConfig; source: string; proven: boolean } {
  if (!args.currentConfigUpdatedAt) {
    return {
      config: args.currentConfig,
      source: "current_config_missing_updatedAt",
      proven: false,
    };
  }
  if (args.orderCreatedAt.getTime() >= args.currentConfigUpdatedAt.getTime()) {
    return {
      config: args.currentConfig,
      source: "db_config_active_at_or_after_updatedAt",
      proven: true,
    };
  }
  return {
    config: HISTORICAL_LIVE_SHOW_FEE_DEFAULTS,
    source: "pre_updatedAt_seed_defaults_8_725_65",
    proven: true,
  };
}

export function resolveMarketplaceFeePercentAsOf(args: {
  orderCreatedAt: Date;
  currentPercent: number;
  currentConfigUpdatedAt: Date | null;
  historicalDefaultPercent?: number;
}): { percent: number; source: string; proven: boolean } {
  const hist = args.historicalDefaultPercent ?? 8;
  if (!args.currentConfigUpdatedAt) {
    return { percent: args.currentPercent, source: "current_marketplace_config_missing_updatedAt", proven: false };
  }
  if (args.orderCreatedAt.getTime() >= args.currentConfigUpdatedAt.getTime()) {
    return { percent: args.currentPercent, source: "db_marketplace_config_active_at_charge", proven: true };
  }
  return { percent: hist, source: "pre_updatedAt_marketplace_default", proven: true };
}

export type OverrideAuditEvent = {
  action: string;
  createdAt: Date;
  newStatus: string | null;
  previousStatus: string | null;
};

/** Reconstruct seller platform-fee override percent active at `at`. */
export function sellerOverridePercentAt(args: {
  events: OverrideAuditEvent[];
  at: Date;
  /** Fallback when no audit events exist before `at`. */
  currentOverridePercent?: number | null;
  currentOverrideAt?: Date | null;
  currentOverrideExpiresAt?: Date | null;
}): number | null {
  const sorted = [...args.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let active: number | null = null;
  let sawAny = false;
  for (const ev of sorted) {
    if (ev.createdAt.getTime() > args.at.getTime()) break;
    sawAny = true;
    if (ev.action === "seller_platform_fee_override") {
      const n = ev.newStatus != null ? Number(ev.newStatus) : NaN;
      active = Number.isFinite(n) ? n : null;
    } else if (ev.action === "seller_platform_fee_override_cleared") {
      active = null;
    }
  }
  if (sawAny) return active;

  // No audit trail before this order — use current override only if it was set at/before charge
  // and not expired at charge time.
  const cur = args.currentOverridePercent;
  if (cur == null || !Number.isFinite(cur)) return null;
  if (args.currentOverrideAt && args.currentOverrideAt.getTime() > args.at.getTime()) return null;
  if (args.currentOverrideExpiresAt && args.currentOverrideExpiresAt.getTime() <= args.at.getTime()) {
    return null;
  }
  // Without audit proof the override existed at charge time, treat as unknown (caller may mark ambiguous).
  if (!args.currentOverrideAt) return null;
  return cur;
}

export function priorShowGmvUsdBeforeOrder(args: {
  orderId: string;
  showOrders: Array<{ id: string; createdAt: Date; itemPriceUsd: number; paymentStatus: string }>;
}): number {
  const self = args.showOrders.find((o) => o.id === args.orderId);
  if (!self) return 0;
  let gmv = 0;
  for (const o of args.showOrders) {
    if (!orderEverCountedTowardShowGmv(o.paymentStatus)) continue;
    if (compareOrderCompletion(o, self) >= 0) continue;
    gmv += platformFeeBaseUsd(o.itemPriceUsd);
  }
  return Math.round(gmv * 100) / 100;
}

/**
 * Infer platform fee cents from Stripe application_fee_amount by removing processing.
 * Never returns stripeApplicationFeeCents itself as the platform fee.
 */
export function implyPlatformFeeCentsFromStripe(args: {
  stripeApplicationFeeCents: number | null | undefined;
  stripeProcessingFeeCents: number | null | undefined;
  buyerChargeCents: number;
  taxAmountCents: number;
}): { impliedCents: number | null; method: string | null } {
  if (args.stripeApplicationFeeCents == null) {
    return { impliedCents: null, method: null };
  }
  // Taxed Connect path usually omits application_fee_amount; if present, still strip processing.
  const estimatedProcessing = estimateStripeProcessingFeeCents(args.buyerChargeCents);
  const actualProcessing =
    args.stripeProcessingFeeCents != null ? Math.max(0, args.stripeProcessingFeeCents) : null;

  const candidates: Array<{ cents: number; method: string }> = [];
  if (actualProcessing != null) {
    candidates.push({
      cents: Math.max(0, args.stripeApplicationFeeCents - actualProcessing),
      method: "app_fee_minus_stripeProcessingFeeCents",
    });
  }
  candidates.push({
    cents: Math.max(0, args.stripeApplicationFeeCents - estimatedProcessing),
    method: "app_fee_minus_estimated_processing_2_9_plus_30",
  });

  // Prefer actual processing subtraction when available.
  return { impliedCents: candidates[0]!.cents, method: candidates[0]!.method };
}

export function matchFeePercentToCents(args: {
  basisUsd: number;
  feeCents: number;
  candidatePercents: number[];
}): number | null {
  const matches = args.candidatePercents.filter(
    (p) => applicationFeeCentsFromSubtotalUsd(args.basisUsd, p) === args.feeCents,
  );
  if (matches.length === 1) return matches[0]!;
  return null;
}

export function buildBackfillSummary(rows: PlatformFeeBackfillAuditRow[]): PlatformFeeBackfillSummary {
  const summary: PlatformFeeBackfillSummary = {
    totalCandidates: rows.length,
    alreadyPopulated: 0,
    verified: 0,
    reconstructedHighConfidence: 0,
    ambiguousManualReview: 0,
    estimatedFromCurrentConfig: 0,
    proposed675Rows: 0,
    proposed575Rows: 0,
    proposed500Rows: 0,
    legitimateHistorical8Rows: 0,
    legitimateHistorical725Rows: 0,
    totalProposedPlatformFeeCents: 0,
    totalMismatchVersusEvidenceCents: 0,
    writableOnApply: 0,
  };

  for (const r of rows) {
    if (r.confidence === "SKIP_ALREADY_POPULATED") summary.alreadyPopulated += 1;
    if (
      r.confidence === "VERIFIED_FROM_PERSISTED_CHARGE_DATA" ||
      r.confidence === "VERIFIED_FROM_STRIPE_AND_ORDER_DATA"
    ) {
      summary.verified += 1;
    }
    if (r.confidence === "RECONSTRUCTED_FROM_SHOW_SEQUENCE") summary.reconstructedHighConfidence += 1;
    if (r.confidence === "AMBIGUOUS_MANUAL_REVIEW") summary.ambiguousManualReview += 1;
    if (r.confidence === "ESTIMATED_FROM_CURRENT_CONFIG") summary.estimatedFromCurrentConfig += 1;

    const pct = r.platformFeePercentAppliedProposed;
    if (pct === 6.75) summary.proposed675Rows += 1;
    if (pct === 5.75) summary.proposed575Rows += 1;
    if (pct === 5 || pct === 5.0) summary.proposed500Rows += 1;
    if (pct === 8) summary.legitimateHistorical8Rows += 1;
    if (pct === 7.25) summary.legitimateHistorical725Rows += 1;

    if (r.platformFeeCentsProposed != null && r.wouldWrite) {
      summary.totalProposedPlatformFeeCents += r.platformFeeCentsProposed;
    }
    if (r.mismatchCents != null) {
      summary.totalMismatchVersusEvidenceCents += Math.abs(r.mismatchCents);
    }
    if (r.wouldWrite) summary.writableOnApply += 1;
  }

  return summary;
}

export function classifyPlatformFeeBackfillRow(args: {
  orderId: string;
  createdAt: Date;
  sellerId: string;
  sellerHandle: string | null;
  liveShowId: string | null;
  itemPriceUsd: number;
  quantity: number;
  totalUsd: number;
  taxAmountCents: number;
  paymentStatus: string;
  isCompanyListing: boolean;
  stripeApplicationFeeCents: number | null;
  stripeProcessingFeeCents: number | null;
  existingPlatformFeeCents: number | null;
  existingPlatformFeePercentApplied: number | null;
  existingPlatformFeeBasisCents: number | null;
  existingPlatformFeePriorShowGmvUsd: number | null;
  existingPlatformFeeSellerOverrideApplied: boolean;
  priorCompletedShowGmvUsd: number | null;
  sellerOverridePercentAtCharge: number | null;
  overrideProvenFromAudit: boolean;
  liveConfig: LiveShowFeeConfig;
  liveConfigUpdatedAt: Date | null;
  marketplaceFeePercent: number;
  marketplaceFeeUpdatedAt: Date | null;
}): PlatformFeeBackfillAuditRow {
  const notes: string[] = [];
  const basisUsd = platformFeeBaseUsd(args.itemPriceUsd);
  const basisCents = Math.max(0, Math.round(basisUsd * 100));
  const saleType: "live" | "marketplace" = args.liveShowId ? "live" : "marketplace";
  const buyerChargeCents = Math.max(0, Math.round(args.totalUsd * 100));

  const baseRow = {
    orderId: args.orderId,
    createdAt: args.createdAt.toISOString(),
    sellerId: args.sellerId,
    sellerHandle: args.sellerHandle,
    showOrLiveRoomId: args.liveShowId,
    saleType,
    itemSubtotalCents: basisCents,
    quantity: args.quantity,
    stripeApplicationFeeCents: args.stripeApplicationFeeCents,
    stripeProcessingFeeCents: args.stripeProcessingFeeCents,
    existingPlatformFeeCents: args.existingPlatformFeeCents,
    existingPlatformFeePercentApplied: args.existingPlatformFeePercentApplied,
    existingPlatformFeeBasisCents: args.existingPlatformFeeBasisCents,
    existingPlatformFeePriorShowGmvUsd: args.existingPlatformFeePriorShowGmvUsd,
    existingPlatformFeeSellerOverrideApplied: args.existingPlatformFeeSellerOverrideApplied,
  };

  const alreadyPopulated =
    args.existingPlatformFeeCents != null &&
    args.existingPlatformFeePercentApplied != null &&
    args.existingPlatformFeeBasisCents != null;

  if (alreadyPopulated) {
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: args.existingPlatformFeeBasisCents,
      priorCompletedShowGmvUsdProposed: args.existingPlatformFeePriorShowGmvUsd,
      platformFeePercentAppliedProposed: args.existingPlatformFeePercentApplied,
      platformFeeCentsProposed: args.existingPlatformFeeCents,
      sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
      sellerOverrideApplied: args.existingPlatformFeeSellerOverrideApplied,
      expectedFeeFromChargeEvidenceCents: args.existingPlatformFeeCents,
      reconstructionSource: "existing_persisted_snapshot",
      confidence: "SKIP_ALREADY_POPULATED",
      mismatchCents: 0,
      wouldWrite: false,
      notes: ["Already has platformFeeCents/Percent/Basis — skip write"],
    };
  }

  if (args.isCompanyListing) {
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: basisCents,
      priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
      platformFeePercentAppliedProposed: 0,
      platformFeeCentsProposed: 0,
      sellerOverridePercentAtCharge: null,
      sellerOverrideApplied: false,
      expectedFeeFromChargeEvidenceCents: 0,
      reconstructionSource: "company_listing_zero_fee",
      confidence: "RECONSTRUCTED_FROM_SHOW_SEQUENCE",
      mismatchCents: 0,
      wouldWrite: true,
      notes: ["Company listing — platform fee 0"],
    };
  }

  const stripeImplied = implyPlatformFeeCentsFromStripe({
    stripeApplicationFeeCents: args.stripeApplicationFeeCents,
    stripeProcessingFeeCents: args.stripeProcessingFeeCents,
    buyerChargeCents,
    taxAmountCents: args.taxAmountCents,
  });

  const candidatePercents = Array.from(
    new Set([
      8,
      7.25,
      6.75,
      6.5,
      5.75,
      5,
      args.liveConfig.tier1FeePercent,
      args.liveConfig.tier2FeePercent,
      args.liveConfig.tier3FeePercent,
      HISTORICAL_LIVE_SHOW_FEE_DEFAULTS.tier1FeePercent,
      HISTORICAL_LIVE_SHOW_FEE_DEFAULTS.tier2FeePercent,
      HISTORICAL_LIVE_SHOW_FEE_DEFAULTS.tier3FeePercent,
      args.marketplaceFeePercent,
      ...(args.sellerOverridePercentAtCharge != null ? [args.sellerOverridePercentAtCharge] : []),
    ]),
  ).filter((p) => Number.isFinite(p) && p >= 0);

  let stripeMatchedPercent: number | null = null;
  if (stripeImplied.impliedCents != null) {
    stripeMatchedPercent = matchFeePercentToCents({
      basisUsd,
      feeCents: stripeImplied.impliedCents,
      candidatePercents,
    });
    // Also try alternate estimate/actual if first method didn't unique-match
    if (stripeMatchedPercent == null && args.stripeApplicationFeeCents != null) {
      const alt = Math.max(
        0,
        args.stripeApplicationFeeCents - estimateStripeProcessingFeeCents(buyerChargeCents),
      );
      stripeMatchedPercent = matchFeePercentToCents({
        basisUsd,
        feeCents: alt,
        candidatePercents,
      });
      if (stripeMatchedPercent != null) {
        notes.push("Stripe match via app_fee − estimated processing");
      }
    } else if (stripeMatchedPercent != null) {
      notes.push(`Stripe match via ${stripeImplied.method}`);
    }
  }

  let reconstructedPercent: number | null = null;
  let reconstructionSource = "";
  let reconstructionProven = false;

  if (args.sellerOverridePercentAtCharge != null) {
    if (args.overrideProvenFromAudit) {
      reconstructedPercent = args.sellerOverridePercentAtCharge;
      reconstructionSource = "seller_override_audit_at_charge";
      reconstructionProven = true;
    } else {
      notes.push("Seller override present but not proven via audit at charge time");
    }
  }

  if (reconstructedPercent == null) {
    if (saleType === "live") {
      const cfg = resolveLiveShowFeeConfigAsOf({
        orderCreatedAt: args.createdAt,
        currentConfig: args.liveConfig,
        currentConfigUpdatedAt: args.liveConfigUpdatedAt,
      });
      const prior = args.priorCompletedShowGmvUsd ?? 0;
      reconstructedPercent = liveShowFeePercentForGmv(prior, cfg.config);
      reconstructionSource = `${cfg.source}; priorShowGmvUsd=${prior}`;
      reconstructionProven = cfg.proven;
    } else {
      const m = resolveMarketplaceFeePercentAsOf({
        orderCreatedAt: args.createdAt,
        currentPercent: args.marketplaceFeePercent,
        currentConfigUpdatedAt: args.marketplaceFeeUpdatedAt,
      });
      reconstructedPercent = m.percent;
      reconstructionSource = m.source;
      reconstructionProven = m.proven;
    }
  }

  // Prefer Stripe-verified historical rate (preserves legitimate 8% / 7.25%).
  if (stripeMatchedPercent != null) {
    const feeCents = applicationFeeCentsFromSubtotalUsd(basisUsd, stripeMatchedPercent);
    const mismatch =
      stripeImplied.impliedCents != null ? feeCents - stripeImplied.impliedCents : null;
    if (
      reconstructedPercent != null &&
      Math.abs(reconstructedPercent - stripeMatchedPercent) > 0.001
    ) {
      notes.push(
        `Stripe rate ${stripeMatchedPercent}% differs from reconstruction ${reconstructedPercent}% — using Stripe`,
      );
    }
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: basisCents,
      priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
      platformFeePercentAppliedProposed: stripeMatchedPercent,
      platformFeeCentsProposed: feeCents,
      sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
      sellerOverrideApplied:
        args.sellerOverridePercentAtCharge != null &&
        Math.abs(args.sellerOverridePercentAtCharge - stripeMatchedPercent) < 0.001,
      expectedFeeFromChargeEvidenceCents: stripeImplied.impliedCents,
      reconstructionSource: `stripe_verified; ${reconstructionSource}`,
      confidence: "VERIFIED_FROM_STRIPE_AND_ORDER_DATA",
      mismatchCents: mismatch,
      wouldWrite: true,
      notes,
    };
  }

  if (args.stripeApplicationFeeCents != null && stripeMatchedPercent == null) {
    const reconstructedFeeCents =
      reconstructedPercent != null
        ? applicationFeeCentsFromSubtotalUsd(basisUsd, reconstructedPercent)
        : null;
    // Tiny orders: multiple percents can round to the same cents (e.g. $1 → 7¢ for both 6.75% and 7.25%).
    // If Stripe-implied platform cents agree with proven reconstruction, accept reconstruction.
    if (
      reconstructionProven &&
      reconstructedPercent != null &&
      reconstructedFeeCents != null &&
      stripeImplied.impliedCents != null &&
      reconstructedFeeCents === stripeImplied.impliedCents
    ) {
      notes.push(
        `Stripe app_fee did not uniquely identify a percent (rounding collision); implied platform cents=${stripeImplied.impliedCents} agree with proven reconstruction ${reconstructedPercent}%`,
      );
      return {
        ...baseRow,
        platformFeeBasisCentsProposed: basisCents,
        priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
        platformFeePercentAppliedProposed: reconstructedPercent,
        platformFeeCentsProposed: reconstructedFeeCents,
        sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
        sellerOverrideApplied:
          args.overrideProvenFromAudit && args.sellerOverridePercentAtCharge != null,
        expectedFeeFromChargeEvidenceCents: stripeImplied.impliedCents,
        reconstructionSource: `stripe_cents_agree_plus_${reconstructionSource}`,
        confidence: "VERIFIED_FROM_STRIPE_AND_ORDER_DATA",
        mismatchCents: 0,
        wouldWrite: true,
        notes,
      };
    }

    notes.push(
      `Stripe application_fee=${args.stripeApplicationFeeCents} did not uniquely match a known platform rate after removing processing — manual review`,
    );
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: basisCents,
      priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
      platformFeePercentAppliedProposed: reconstructedPercent,
      platformFeeCentsProposed: reconstructedFeeCents,
      sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
      sellerOverrideApplied: false,
      expectedFeeFromChargeEvidenceCents: stripeImplied.impliedCents,
      reconstructionSource: reconstructionSource || "stripe_ambiguous",
      confidence: "AMBIGUOUS_MANUAL_REVIEW",
      mismatchCents:
        reconstructedFeeCents != null && stripeImplied.impliedCents != null
          ? reconstructedFeeCents - stripeImplied.impliedCents
          : null,
      wouldWrite: false,
      notes,
    };
  }

  if (reconstructedPercent == null) {
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: basisCents,
      priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
      platformFeePercentAppliedProposed: null,
      platformFeeCentsProposed: null,
      sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
      sellerOverrideApplied: false,
      expectedFeeFromChargeEvidenceCents: null,
      reconstructionSource: "unable_to_reconstruct",
      confidence: "AMBIGUOUS_MANUAL_REVIEW",
      mismatchCents: null,
      wouldWrite: false,
      notes: [...notes, "No reconstruction percent available"],
    };
  }

  const feeCents = applicationFeeCentsFromSubtotalUsd(basisUsd, reconstructedPercent);

  if (!reconstructionProven) {
    return {
      ...baseRow,
      platformFeeBasisCentsProposed: basisCents,
      priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
      platformFeePercentAppliedProposed: reconstructedPercent,
      platformFeeCentsProposed: feeCents,
      sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
      sellerOverrideApplied: args.overrideProvenFromAudit && args.sellerOverridePercentAtCharge != null,
      expectedFeeFromChargeEvidenceCents: null,
      reconstructionSource,
      confidence: "ESTIMATED_FROM_CURRENT_CONFIG",
      mismatchCents: null,
      wouldWrite: false,
      notes: [...notes, "Config period not proven — will not auto-backfill"],
    };
  }

  return {
    ...baseRow,
    platformFeeBasisCentsProposed: basisCents,
    priorCompletedShowGmvUsdProposed: args.priorCompletedShowGmvUsd,
    platformFeePercentAppliedProposed: reconstructedPercent,
    platformFeeCentsProposed: feeCents,
    sellerOverridePercentAtCharge: args.sellerOverridePercentAtCharge,
    sellerOverrideApplied: args.overrideProvenFromAudit && args.sellerOverridePercentAtCharge != null,
    expectedFeeFromChargeEvidenceCents: null,
    reconstructionSource,
    confidence: "RECONSTRUCTED_FROM_SHOW_SEQUENCE",
    mismatchCents: null,
    wouldWrite: true,
    notes,
  };
}
