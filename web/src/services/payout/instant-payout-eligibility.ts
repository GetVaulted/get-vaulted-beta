import {
  EscrowStatus,
  InstantPayoutStatus,
  OrderPaymentMethod,
  OrderPayoutMethod,
  OrderPayoutStatus,
  type PayoutRiskLevel,
} from "@/generated/prisma/enums";
import {
  hasCompleteSellerShipFrom,
  hasStripeConnectReady,
  type SellerShipFromFields,
  type SellerStripeFields,
} from "@/lib/seller-shipping-readiness";
import { getCachedPayoutProgramConfig } from "@/services/payout/payout-program-settings";
import { STRIPE_US_INSTANT_PAYOUT_MAX_USD } from "@/lib/stripe-instant-payout-reference";

/** High-value order threshold for manual review (USD). Matches platform instant per-order cap. */
export function suspiciousOrderValueUsd(): number {
  return getCachedPayoutProgramConfig().instantLimits.perOrderUsd;
}

/** @deprecated use suspiciousOrderValueUsd() */
export const SUSPICIOUS_ORDER_VALUE_USD = STRIPE_US_INSTANT_PAYOUT_MAX_USD;

export type OrderPayoutDisqualifier =
  | "missing_tracking"
  | "invalid_tracking"
  | "no_carrier_movement"
  | "buyer_dispute"
  | "refund_requested"
  | "chargeback"
  | "suspicious_order_value"
  | "seller_account_flagged"
  | "admin_disabled_instant_payout"
  | "shipping_mismatch"
  | "delivery_exception"
  | "manual_review_required"
  | "payment_not_paid"
  | "escrow_release_paused"
  | "stripe_payout_account_missing";

export type SellerPayoutEligibilitySlice = SellerShipFromFields &
  SellerStripeFields & {
    id: string;
    suspendedAt: Date | null;
    sellerSetupWizardCompletedAt: Date | null;
    instantPayoutEligible: boolean;
    instantPayoutStatus: InstantPayoutStatus;
    instantPayoutOverrideByAdmin: boolean;
    payoutRiskLevel: PayoutRiskLevel;
    payoutHoldDays: number;
    payoutReservePercent: number;
    stripePayoutsEnabled: boolean | null;
  };

export type OrderPayoutEvaluationSlice = {
  id: string;
  sellerId: string;
  paymentStatus: string;
  paymentMethod: OrderPaymentMethod;
  fulfillmentStatus: string;
  escrowStatus: EscrowStatus | null;
  escrowReleasePaused: boolean;
  trackingNumber: string | null;
  shippingStatus: string | null;
  itemPriceUsd: number;
  totalUsd: number;
  payoutStatus: OrderPayoutStatus;
  payoutBlockedReason: string | null;
};

export type SellerEligibilityResult = {
  eligible: boolean;
  status: InstantPayoutStatus;
  requirementsMet: string[];
  requirementsFailed: string[];
  trackingComplianceRate: number | null;
  disputeRefundRate: number | null;
};

export type OrderPayoutEvaluationResult = {
  sellerEligible: boolean;
  instantPayoutAllowed: boolean;
  disqualifiers: OrderPayoutDisqualifier[];
  recommendedStatus: OrderPayoutStatus;
  recommendedMethod: OrderPayoutMethod;
  payoutHoldUntil: Date | null;
  payoutReserveAmountCents: number;
  blockedReason: string | null;
};

export type SellerOrderStats = {
  recentPaidOrders: number;
  ordersWithTracking: number;
  disputedOrRefunded: number;
};

export function computePayoutReserveCents(itemPriceUsd: number, reservePercent: number): number {
  const pct = Math.max(0, Math.min(100, reservePercent));
  return Math.round(Math.max(0, itemPriceUsd) * 100 * (pct / 100));
}

export function computeStandardPayoutHoldUntil(holdDays: number, from: Date = new Date()): Date {
  const days = Math.max(0, holdDays);
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/** Seller must have Stripe payouts enabled — admin override cannot bypass this. */
export function sellerHasVerifiedStripePayoutAccount(seller: SellerPayoutEligibilitySlice): boolean {
  return Boolean(
    seller.stripeAccountId &&
      seller.stripeOnboardingComplete &&
      seller.stripePayoutsEnabled !== false,
  );
}

export function evaluateSellerInstantPayoutEligibility(
  seller: SellerPayoutEligibilitySlice,
  stats: SellerOrderStats,
): SellerEligibilityResult {
  const requirementsMet: string[] = [];
  const requirementsFailed: string[] = [];

  if (seller.sellerSetupWizardCompletedAt || seller.stripeOnboardingComplete) {
    requirementsMet.push("seller_onboarding_complete");
  } else {
    requirementsFailed.push("seller_onboarding_incomplete");
  }

  if (sellerHasVerifiedStripePayoutAccount(seller)) {
    requirementsMet.push("stripe_payout_account_verified");
  } else {
    requirementsFailed.push("stripe_payout_account_not_verified");
  }

  if (hasCompleteSellerShipFrom(seller)) {
    requirementsMet.push("valid_ship_from_address");
  } else {
    requirementsFailed.push("missing_ship_from_address");
  }

  const trackingComplianceRate =
    stats.recentPaidOrders > 0 ? stats.ordersWithTracking / stats.recentPaidOrders : null;
  if (stats.recentPaidOrders === 0 || (trackingComplianceRate !== null && trackingComplianceRate >= 0.85)) {
    requirementsMet.push("tracking_compliance");
  } else {
    requirementsFailed.push("tracking_compliance_low");
  }

  const disputeRefundRate =
    stats.recentPaidOrders > 0 ? stats.disputedOrRefunded / stats.recentPaidOrders : null;
  if (stats.recentPaidOrders === 0 || (disputeRefundRate !== null && disputeRefundRate <= 0.05)) {
    requirementsMet.push("low_dispute_refund_rate");
  } else {
    requirementsFailed.push("high_dispute_refund_rate");
  }

  if (!seller.suspendedAt) {
    requirementsMet.push("no_active_policy_flags");
  } else {
    requirementsFailed.push("account_suspended");
  }

  if (seller.instantPayoutStatus === InstantPayoutStatus.suspended) {
    requirementsFailed.push("admin_suspended_instant_payout");
  }

  if (seller.instantPayoutStatus === InstantPayoutStatus.admin_override && seller.instantPayoutOverrideByAdmin) {
    if (sellerHasVerifiedStripePayoutAccount(seller)) {
      return {
        eligible: true,
        status: InstantPayoutStatus.admin_override,
        requirementsMet: [...requirementsMet, "admin_override_enabled"],
        requirementsFailed,
        trackingComplianceRate,
        disputeRefundRate,
      };
    }
    requirementsFailed.push("admin_override_blocked_missing_stripe");
  }

  const baseEligible = requirementsFailed.length === 0;
  let status = seller.instantPayoutStatus;
  if (baseEligible && status !== InstantPayoutStatus.suspended) {
    status = InstantPayoutStatus.eligible;
  } else if (!baseEligible && status !== InstantPayoutStatus.admin_override) {
    status = InstantPayoutStatus.ineligible;
  }

  return {
    eligible: baseEligible && status !== InstantPayoutStatus.suspended && status !== InstantPayoutStatus.ineligible,
    status,
    requirementsMet,
    requirementsFailed,
    trackingComplianceRate,
    disputeRefundRate,
  };
}

export function evaluateOrderInstantPayoutEligibility(args: {
  order: OrderPayoutEvaluationSlice;
  seller: SellerPayoutEligibilitySlice;
  sellerEval: SellerEligibilityResult;
}): OrderPayoutEvaluationResult {
  const { order, seller, sellerEval } = args;
  const disqualifiers: OrderPayoutDisqualifier[] = [];

  if (order.paymentStatus !== "paid") {
    disqualifiers.push("payment_not_paid");
  }

  if (!sellerHasVerifiedStripePayoutAccount(seller)) {
    disqualifiers.push("stripe_payout_account_missing");
  }

  if (order.payoutStatus === OrderPayoutStatus.manual_review) {
    disqualifiers.push("manual_review_required");
  }

  if (order.payoutBlockedReason?.trim()) {
    disqualifiers.push("manual_review_required");
  }

  if (!order.trackingNumber?.trim()) {
    disqualifiers.push("missing_tracking");
  }

  if (order.fulfillmentStatus === "exception") {
    disqualifiers.push("delivery_exception");
  }

  if (
    order.fulfillmentStatus !== "delivered" &&
    order.fulfillmentStatus !== "in_transit" &&
    order.fulfillmentStatus !== "shipped"
  ) {
    if (order.fulfillmentStatus === "pending" && order.trackingNumber) {
      disqualifiers.push("no_carrier_movement");
    }
  }

  if (order.escrowStatus === EscrowStatus.disputed) {
    disqualifiers.push("buyer_dispute");
  }

  if (order.paymentStatus === "refunded" || order.paymentStatus === "refund_requested") {
    disqualifiers.push("refund_requested");
  }

  if (order.paymentStatus === "chargeback") {
    disqualifiers.push("chargeback");
  }

  if (order.totalUsd >= suspiciousOrderValueUsd()) {
    disqualifiers.push("suspicious_order_value");
  }

  if (seller.suspendedAt) {
    disqualifiers.push("seller_account_flagged");
  }

  if (
    seller.instantPayoutStatus === InstantPayoutStatus.suspended ||
    seller.instantPayoutStatus === InstantPayoutStatus.ineligible
  ) {
    if (!(seller.instantPayoutStatus === InstantPayoutStatus.ineligible && seller.instantPayoutOverrideByAdmin)) {
      disqualifiers.push("admin_disabled_instant_payout");
    }
  }

  if (!sellerEval.eligible) {
    disqualifiers.push("seller_account_flagged");
  }

  if (order.escrowReleasePaused) {
    disqualifiers.push("escrow_release_paused");
  }

  const reserveCents = computePayoutReserveCents(order.itemPriceUsd, seller.payoutReservePercent);
  const instantPayoutAllowed =
    sellerEval.eligible && disqualifiers.length === 0 && order.fulfillmentStatus === "delivered";

  if (instantPayoutAllowed) {
    return {
      sellerEligible: sellerEval.eligible,
      instantPayoutAllowed: true,
      disqualifiers: [],
      recommendedStatus: OrderPayoutStatus.instant_payout_ready,
      recommendedMethod: OrderPayoutMethod.instant_after_delivery,
      payoutHoldUntil: null,
      payoutReserveAmountCents: reserveCents,
      blockedReason: null,
    };
  }

  const blockedReason =
    disqualifiers.length > 0
      ? disqualifiers.join(", ")
      : !sellerEval.eligible
        ? "seller_not_eligible"
        : order.fulfillmentStatus !== "delivered"
          ? "awaiting_delivery"
          : null;

  const needsManualReview = disqualifiers.includes("manual_review_required") || disqualifiers.includes("suspicious_order_value");
  const needsBlock =
    disqualifiers.includes("buyer_dispute") ||
    disqualifiers.includes("refund_requested") ||
    disqualifiers.includes("chargeback") ||
    disqualifiers.includes("missing_tracking") ||
    disqualifiers.includes("delivery_exception") ||
    disqualifiers.includes("escrow_release_paused");

  let recommendedStatus: OrderPayoutStatus = OrderPayoutStatus.held;
  if (needsManualReview) {
    recommendedStatus = OrderPayoutStatus.manual_review;
  } else if (needsBlock) {
    recommendedStatus = OrderPayoutStatus.blocked;
  } else if (order.fulfillmentStatus === "delivered" && sellerEval.eligible) {
    recommendedStatus = OrderPayoutStatus.delivery_confirmed;
  }

  return {
    sellerEligible: sellerEval.eligible,
    instantPayoutAllowed: false,
    disqualifiers,
    recommendedStatus,
    recommendedMethod: OrderPayoutMethod.standard,
    payoutHoldUntil: computeStandardPayoutHoldUntil(seller.payoutHoldDays),
    payoutReserveAmountCents: reserveCents,
    blockedReason,
  };
}
