import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';
import { isSellerPayoutSetupComplete } from '../api/stripeConnectRepository';
import { isPayoutSetupComplete, type SellerReadinessChecks } from './seller-setup-state';

export type PayoutReconcileUiState =
  | 'complete'
  | 'pending_stripe_review'
  | 'continue_stripe'
  | 'status_unavailable';

/** Payout wizard step complete — seller readiness and/or live Connect status. */
export function isWizardPayoutStepComplete(
  checks: SellerReadinessChecks | null | undefined,
  connect: SellerConnectStatusResponse | null | undefined,
): boolean {
  if (isPayoutSetupComplete(checks)) return true;
  if (isSellerPayoutSetupComplete(connect)) return true;
  if (!connect?.stripe_account_id?.trim()) return false;
  return Boolean(
    connect.payout_setup_complete ||
      connect.payout_setup_submitted ||
      connect.stripe_onboarding_complete ||
      connect.can_publish_active_listings,
  );
}

/** Log Stripe Connect snapshot after onboarding return (dev + production diagnostics). */
export function logSellerStripeConnectStatus(
  connect: SellerConnectStatusResponse | null,
  context: string,
  extra?: Record<string, unknown>,
): void {
  const req = connect?.stripe_requirements_due;
  const payload = {
    context,
    stripeConfigured: connect?.stripeConfigured ?? null,
    stripe_account_id: connect?.stripe_account_id ?? null,
    stripe_onboarding_complete: connect?.stripe_onboarding_complete ?? null,
    stripe_charges_enabled: connect?.stripe_charges_enabled ?? null,
    stripe_payouts_enabled: connect?.stripe_payouts_enabled ?? null,
    onboarding_ui_status: connect?.onboarding_ui_status ?? null,
    payout_setup_complete: connect?.payout_setup_complete ?? null,
    payout_setup_submitted: connect?.payout_setup_submitted ?? null,
    can_publish_active_listings: connect?.can_publish_active_listings ?? null,
    payouts_ready: connect?.payouts_ready ?? null,
    currently_due: req?.currentlyDue ?? [],
    pending_verification: req?.pendingVerification ?? [],
    eventually_due: req?.eventuallyDue ?? [],
    disabled_reason: req?.disabledReason ?? null,
    stripe_verification_status: connect?.stripe_verification_status ?? null,
    message_onboarding: connect?.message_onboarding ?? null,
    message_payouts: connect?.message_payouts ?? null,
    ...extra,
  };
  console.info('[seller-stripe-connect]', JSON.stringify(payload));
}

/**
 * Seller should reopen Stripe hosted onboarding (more fields due or flow not submitted).
 */
export function sellerShouldContinueStripeOnboarding(
  connect: SellerConnectStatusResponse | null | undefined,
  checks: SellerReadinessChecks | null | undefined,
): boolean {
  if (isWizardPayoutStepComplete(checks, connect)) return false;
  if (!connect?.stripeConfigured) return false;

  const accountId = connect.stripe_account_id?.trim();
  const currentlyDue = connect.stripe_requirements_due?.currentlyDue ?? [];

  if (!accountId) return true;

  if (connect.onboarding_ui_status === 'action_required' || connect.onboarding_ui_status === 'in_progress') {
    return true;
  }
  if (currentlyDue.length > 0) return true;

  if (
    !connect.payout_setup_submitted &&
    !connect.stripe_onboarding_complete &&
    !connect.payout_setup_complete &&
    connect.onboarding_ui_status !== 'pending_review' &&
    connect.onboarding_ui_status !== 'verified'
  ) {
    return true;
  }

  return false;
}

export function resolvePayoutReconcileUiState(
  connect: SellerConnectStatusResponse | null | undefined,
  checks: SellerReadinessChecks | null | undefined,
  connectError: string | null | undefined,
): PayoutReconcileUiState {
  if (isWizardPayoutStepComplete(checks, connect)) return 'complete';
  if (!connect && connectError?.trim()) return 'status_unavailable';
  if (sellerShouldContinueStripeOnboarding(connect, checks)) return 'continue_stripe';
  if (
    connect?.payout_setup_submitted ||
    connect?.onboarding_ui_status === 'pending_review' ||
    connect?.onboarding_ui_status === 'verified'
  ) {
    return 'pending_stripe_review';
  }
  return 'status_unavailable';
}

export function payoutReconcileMessage(
  ui: PayoutReconcileUiState,
  connect?: SellerConnectStatusResponse | null,
  connectError?: string | null,
): string {
  switch (ui) {
    case 'continue_stripe':
      return 'Stripe still needs a few details to enable payouts. Tap Continue Stripe setup to finish in Stripe.';
    case 'pending_stripe_review':
      return (
        connect?.message_payouts?.trim() ??
        'Stripe received your details and is finishing verification. Tap Retry in a moment, or Continue Stripe setup if Stripe prompts for more info.'
      );
    case 'status_unavailable':
      return (
        connectError?.trim() ??
        'We could not load payout status from the server. Check your connection and tap Retry.'
      );
    default:
      return '';
  }
}
