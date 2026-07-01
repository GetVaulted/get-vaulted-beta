/**
 * Stripe-aligned defaults for Get Vaulted seller payout program (US Connect).
 *
 * Sources:
 * - https://docs.stripe.com/connect/instant-payouts (US max $9,999 per payout)
 * - https://docs.stripe.com/payouts/instant-payouts (max 10 instant payouts per day)
 * - https://stripe.com/resources/more/payouts-explained (typically 60+ days processing before instant access)
 * - https://docs.stripe.com/connect/risk-management/best-practices (dispute rates above ~0.75% are high risk)
 *
 * Fast payout tier thresholds are Get Vaulted program policy (not a Stripe product).
 */

export const STRIPE_US_INSTANT_PAYOUT_MAX_USD = 9_999;
export const STRIPE_US_INSTANT_PAYOUT_MAX_DAILY_COUNT = 10;
export const STRIPE_US_INSTANT_PAYOUT_MAX_DAILY_USD =
  STRIPE_US_INSTANT_PAYOUT_MAX_USD * STRIPE_US_INSTANT_PAYOUT_MAX_DAILY_COUNT;

/** Stripe commonly requires ~60 days of processing history before instant payout access. */
export const STRIPE_ALIGNED_INSTANT_MIN_ACCOUNT_AGE_DAYS = 60;

/** Stripe eligibility tools include minimum processing volume; no public USD floor — conservative platform default. */
export const STRIPE_ALIGNED_INSTANT_MIN_LIFETIME_GMV_USD = 5_000;

/** Stripe risk guidance treats ~0.75% dispute/chargeback rates as elevated. */
export const STRIPE_ALIGNED_MAX_CHARGEBACK_RATE = 0.0075;
export const STRIPE_ALIGNED_MAX_DISPUTE_RATE = 0.0075;

/** Get Vaulted fast tier defaults (platform policy, not Stripe). */
export const GV_DEFAULT_FAST_MIN_ACCOUNT_AGE_DAYS = 30;
export const GV_DEFAULT_FAST_MIN_LIFETIME_GMV_USD = 10_000;
export const GV_DEFAULT_FAST_MIN_COMPLETED_ORDERS = 100;

export const GV_DEFAULT_INSTANT_MAX_CANCELLATION_RATE = 0.01;
export const GV_DEFAULT_INSTANT_MAX_OUTSTANDING_USD = 25_000;

export type PayoutProgramThresholds = {
  fast: {
    minAccountAgeDays: number;
    minLifetimeGmvUsd: number;
    minCompletedOrders: number;
  };
  instant: {
    minAccountAgeDays: number;
    minLifetimeGmvUsd: number;
    maxCancellationRate: number;
    maxChargebackRate: number;
    maxDisputeRate: number;
    maxUnresolvedDisputes: number;
  };
};

export type PayoutProgramInstantLimits = {
  perOrderUsd: number;
  dailyUsd: number;
  maxDailyCount: number;
  maxOutstandingUsd: number;
};

export type PayoutProgramConfig = {
  thresholds: PayoutProgramThresholds;
  instantLimits: PayoutProgramInstantLimits;
  instantSuspensionRateCeiling: number;
};

/** Default program config aligned with Stripe instant payout rules where Stripe publishes them. */
export const STRIPE_ALIGNED_PAYOUT_PROGRAM_DEFAULTS: PayoutProgramConfig = {
  thresholds: {
    fast: {
      minAccountAgeDays: GV_DEFAULT_FAST_MIN_ACCOUNT_AGE_DAYS,
      minLifetimeGmvUsd: GV_DEFAULT_FAST_MIN_LIFETIME_GMV_USD,
      minCompletedOrders: GV_DEFAULT_FAST_MIN_COMPLETED_ORDERS,
    },
    instant: {
      minAccountAgeDays: STRIPE_ALIGNED_INSTANT_MIN_ACCOUNT_AGE_DAYS,
      minLifetimeGmvUsd: STRIPE_ALIGNED_INSTANT_MIN_LIFETIME_GMV_USD,
      maxCancellationRate: GV_DEFAULT_INSTANT_MAX_CANCELLATION_RATE,
      maxChargebackRate: STRIPE_ALIGNED_MAX_CHARGEBACK_RATE,
      maxDisputeRate: STRIPE_ALIGNED_MAX_DISPUTE_RATE,
      maxUnresolvedDisputes: 0,
    },
  },
  instantLimits: {
    perOrderUsd: STRIPE_US_INSTANT_PAYOUT_MAX_USD,
    dailyUsd: STRIPE_US_INSTANT_PAYOUT_MAX_DAILY_USD,
    maxDailyCount: STRIPE_US_INSTANT_PAYOUT_MAX_DAILY_COUNT,
    maxOutstandingUsd: GV_DEFAULT_INSTANT_MAX_OUTSTANDING_USD,
  },
  instantSuspensionRateCeiling: STRIPE_ALIGNED_MAX_CHARGEBACK_RATE,
};
