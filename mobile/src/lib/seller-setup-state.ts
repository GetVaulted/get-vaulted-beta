/** Shared seller onboarding / activation states (mirrors web). */
export type SellerLifecycleState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'READY_FOR_SELLER_HQ'
  | 'VERIFIED_SELLER'
  | 'LIVE_ENABLED';

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
  preferredSellerPayoutProcessor?: 'STRIPE' | 'PAYPAL';
};

export type SellerSetupPhase = 'loading' | 'not_started' | 'partial' | 'ready';

function isStripePayoutReady(checks: SellerReadinessChecks): boolean {
  return Boolean(
    checks.hasStripeAccount && (checks.stripePayoutSubmitted || checks.stripeChargesEnabled),
  );
}

/** Wizard payout step — Stripe submitted/verified OR PayPal email verified. */
export function isPayoutSetupSubmitted(checks: SellerReadinessChecks | null | undefined): boolean {
  if (!checks) return false;
  if (checks.paypalPayoutReady) return true;
  return isStripePayoutReady(checks);
}

/** Full payout verification — publish / go-live gate (not wizard). */
export function isPayoutSetupComplete(checks: SellerReadinessChecks | null | undefined): boolean {
  if (!checks) return false;
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
      checks?.preferredSellerPayoutProcessor === 'PAYPAL',
  );
}

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
  if (loading) return 'loading';
  if (isSellerActivated(checks, wizardComplete)) return 'ready';
  return sellerSetupStarted(checks) ? 'partial' : 'not_started';
}

export function resolveSellerLifecycleState(input: {
  checks: SellerReadinessChecks | null | undefined;
  wizardComplete: boolean;
  canGoLive: boolean;
  loading: boolean;
}): SellerLifecycleState {
  if (input.loading) return 'NOT_STARTED';
  const checks = input.checks;
  if (isSellerActivated(checks, input.wizardComplete)) {
    return input.canGoLive ? 'LIVE_ENABLED' : 'VERIFIED_SELLER';
  }
  if (isRequiredSellerSetupComplete(checks)) return 'READY_FOR_SELLER_HQ';
  return sellerSetupStarted(checks) ? 'IN_PROGRESS' : 'NOT_STARTED';
}

export function sellerSetupStripCopy(phase: SellerSetupPhase): {
  title: string;
  body: string;
  cta: string;
  icon: 'storefront-outline' | 'construct-outline';
} {
  switch (phase) {
    case 'partial':
      return {
        title: 'Continue Seller Setup',
        body: 'Complete payout and shipping setup to unlock Seller HQ.',
        cta: 'Continue Seller Setup',
        icon: 'construct-outline',
      };
    case 'not_started':
    default:
      return {
        title: 'Become a Seller',
        body: 'Set up payouts and shipping to list inventory and run live shows.',
        cta: 'Start Seller Setup',
        icon: 'storefront-outline',
      };
  }
}

export function sellerSetupMenuLabel(phase: SellerSetupPhase): string {
  switch (phase) {
    case 'ready':
      return 'Enter Seller HQ';
    case 'partial':
      return 'Continue Seller Setup';
    case 'not_started':
      return 'Start Seller Setup';
    default:
      return 'Start Seller Setup';
  }
}

export function normalizeSellerReadinessChecks(
  raw: Record<string, boolean | string | null | undefined> | null | undefined,
): SellerReadinessChecks {
  const preferred =
    raw?.preferredSellerPayoutProcessor === 'PAYPAL' || raw?.preferredSellerPayoutProcessor === 'STRIPE'
      ? raw.preferredSellerPayoutProcessor
      : undefined;
  return {
    hasStripeAccount: Boolean(raw?.hasStripeAccount),
    stripeChargesEnabled: Boolean(raw?.stripeChargesEnabled),
    stripePayoutSubmitted: Boolean(raw?.stripePayoutSubmitted || raw?.stripeChargesEnabled),
    hasShipFromAddress: Boolean(raw?.hasShipFromAddress),
    paypalPayoutReady: Boolean(raw?.paypalPayoutReady),
    preferredSellerPayoutProcessor: preferred,
  };
}

export type SellerSetupDataSource = 'cache' | 'server' | 'loading' | 'error';

/** Server `sellerSetupWizardCompletedAt` wins; AsyncStorage is optimistic fallback only. */
export function resolveWizardCompleteFromSources(input: {
  sellerSetupWizardCompletedAt?: string | null;
  setupWizardComplete?: boolean;
  localWizardComplete: boolean;
  stickyServerConfirmed: boolean;
  serverResponded: boolean;
}): {
  wizardComplete: boolean;
  serverWizardConfirmed: boolean;
  serverExplicitIncomplete: boolean;
} {
  const serverAt = input.sellerSetupWizardCompletedAt ?? null;
  const serverComplete = input.setupWizardComplete === true || Boolean(serverAt);
  if (serverComplete) {
    return { wizardComplete: true, serverWizardConfirmed: true, serverExplicitIncomplete: false };
  }
  if (input.stickyServerConfirmed) {
    return { wizardComplete: true, serverWizardConfirmed: true, serverExplicitIncomplete: false };
  }
  if (input.serverResponded && input.setupWizardComplete === false && !serverAt) {
    return {
      wizardComplete: false,
      serverWizardConfirmed: false,
      serverExplicitIncomplete: true,
    };
  }
  if (!input.serverResponded && input.localWizardComplete) {
    return {
      wizardComplete: true,
      serverWizardConfirmed: input.stickyServerConfirmed,
      serverExplicitIncomplete: false,
    };
  }
  return {
    wizardComplete: false,
    serverWizardConfirmed: false,
    serverExplicitIncomplete: false,
  };
}

export function logSellerSetupTransition(args: {
  previousLifecycle: SellerLifecycleState;
  nextLifecycle: SellerLifecycleState;
  source: SellerSetupDataSource;
  sellerSetupWizardCompletedAt: string | null;
  activated: boolean;
}): void {
  if (!__DEV__) return;
  console.log(
    '[sellerSetup]',
    `lifecycle ${args.previousLifecycle} → ${args.nextLifecycle}`,
    `source=${args.source}`,
    `wizardAt=${args.sellerSetupWizardCompletedAt ?? 'null'}`,
    `activated=${args.activated}`,
  );
}
