/** Shared seller onboarding / activation states (mirrors mobile). */
export type SellerLifecycleState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY_FOR_SELLER_HQ"
  | "VERIFIED_SELLER"
  | "LIVE_ENABLED";

export const SELLER_SETUP_PATH = "/account/seller/setup";
export const SELLER_HQ_PATH = "/account/seller";

export type SellerPayoutProcessorChoice = "STRIPE" | "PAYPAL";

export type SellerReadinessChecks = {
  hasStripeAccount: boolean;
  /** Full Stripe verification clear (charges / onboarding complete). Required to sell / go live on Stripe rail. */
  stripeChargesEnabled: boolean;
  /**
   * Hosted Connect submitted (details_submitted + no currently_due).
   * Pending Stripe review still counts — enough to finish the seller wizard / unlock HQ.
   */
  stripePayoutSubmitted: boolean;
  hasShipFromAddress: boolean;
  /** Seller chose PayPal and has a verified payout email. */
  paypalPayoutReady?: boolean;
  preferredSellerPayoutProcessor?: SellerPayoutProcessorChoice;
};

export type SellerSetupPhase = "loading" | "not_started" | "partial" | "ready";

function isStripePayoutReady(checks: SellerReadinessChecks): boolean {
  return Boolean(
    checks.hasStripeAccount && (checks.stripePayoutSubmitted || checks.stripeChargesEnabled),
  );
}

/** Wizard payout step — ready for the seller's *chosen* rail only. */
export function isPayoutSetupSubmitted(checks: SellerReadinessChecks | null | undefined): boolean {
  if (!checks) return false;
  // Choosing PayPal must not look "done" just because Stripe was connected earlier.
  if (checks.preferredSellerPayoutProcessor === "PAYPAL") {
    return Boolean(checks.paypalPayoutReady);
  }
  if (checks.paypalPayoutReady) return true;
  return isStripePayoutReady(checks);
}

/** Full payout verification — publish / go-live gate (not wizard). */
export function isPayoutSetupComplete(checks: SellerReadinessChecks | null | undefined): boolean {
  if (!checks) return false;
  if (checks.preferredSellerPayoutProcessor === "PAYPAL") {
    return Boolean(checks.paypalPayoutReady);
  }
  if (checks.paypalPayoutReady) return true;
  return Boolean(checks.hasStripeAccount && checks.stripeChargesEnabled);
}

/** Wizard / Seller HQ unlock — payout rail ready (+ ship-from), not full Stripe verification. */
export function isRequiredSellerSetupComplete(
  checks: SellerReadinessChecks | null | undefined,
): boolean {
  if (!checks) return false;
  return Boolean(isPayoutSetupSubmitted(checks) && checks.hasShipFromAddress);
}

function sellerSetupStarted(checks: SellerReadinessChecks | null | undefined): boolean {
  return Boolean(
    checks?.hasStripeAccount ||
      checks?.hasShipFromAddress ||
      checks?.paypalPayoutReady ||
      checks?.preferredSellerPayoutProcessor === "PAYPAL",
  );
}

/** Seller is fully activated (required setup + onboarding wizard finished). */
export function isSellerActivated(
  checks: SellerReadinessChecks | null | undefined,
  wizardComplete: boolean,
): boolean {
  return isRequiredSellerSetupComplete(checks) && wizardComplete;
}

export function resolveSellerSetupPhase(
  checks: SellerReadinessChecks | null | undefined,
  loading: boolean,
  wizardComplete = false,
): SellerSetupPhase {
  if (loading) return "loading";
  if (isSellerActivated(checks, wizardComplete)) return "ready";
  return sellerSetupStarted(checks) ? "partial" : "not_started";
}

export function sellerSetupMenuLabel(phase: SellerSetupPhase): string {
  switch (phase) {
    case "ready":
      return "Enter Seller HQ";
    case "partial":
      return "Continue Seller Setup";
    case "not_started":
      return "Start Seller Setup";
    default:
      return "Start Seller Setup";
  }
}

export function sellerSetupMenuHref(phase: SellerSetupPhase): string {
  return phase === "ready" ? SELLER_HQ_PATH : SELLER_SETUP_PATH;
}

export type SellerSetupProgressInput = {
  checks: SellerReadinessChecks | null | undefined;
  hasProfilePhoto: boolean;
  hasBio: boolean;
  hasCategories: boolean;
};

/** Unified onboarding progress (required + optional visible steps only). */
export function computeSellerSetupProgress(input: SellerSetupProgressInput): {
  completed: number;
  total: number;
} {
  const checks = input.checks;
  const steps = [
    isPayoutSetupSubmitted(checks),
    Boolean(checks?.hasShipFromAddress),
    input.hasProfilePhoto,
    input.hasBio,
    input.hasCategories,
  ];
  const completed = steps.filter(Boolean).length;
  return { completed, total: steps.length };
}

export function resolveSellerLifecycleState(input: {
  checks: SellerReadinessChecks | null | undefined;
  wizardComplete: boolean;
  canGoLive: boolean;
  loading: boolean;
}): SellerLifecycleState {
  if (input.loading) return "NOT_STARTED";
  const checks = input.checks;
  if (isSellerActivated(checks, input.wizardComplete)) {
    return input.canGoLive ? "LIVE_ENABLED" : "VERIFIED_SELLER";
  }
  if (isRequiredSellerSetupComplete(checks)) return "READY_FOR_SELLER_HQ";
  return sellerSetupStarted(checks) ? "IN_PROGRESS" : "NOT_STARTED";
}
