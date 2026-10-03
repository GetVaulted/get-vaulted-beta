import type { SellerLiveReadiness } from '../api/liveHostRepository';
import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';

export type LiveSalesGate = {
  blocked: boolean;
  bannerMessage: string | null;
  alertTitle: string;
  alertBody: string;
  nextStep: 'stripe' | 'ship_from' | null;
};

/** Mirrors web Seller Home `getNextReadinessStep` using live-readiness checks. */
export function getNextLiveReadinessStep(
  checks: NonNullable<SellerLiveReadiness['checks']>,
): 'stripe' | 'ship_from' | 'ready' {
  const payoutOk =
    checks.paypalPayoutReady === true ||
    (checks.hasStripeAccount !== false && checks.stripeChargesEnabled !== false);
  if (!payoutOk) return 'stripe';
  if (!checks.hasShipFromAddress) return 'ship_from';
  return 'ready';
}

/**
 * Single gate for schedule / host entry on mobile — requires `/api/seller/live-readiness`
 * (same source as POST /api/live-rooms). Does not infer "Ready" from Stripe connect alone.
 */
export function resolveLiveSalesGate(
  connect: SellerConnectStatusResponse | null | undefined,
  readiness: SellerLiveReadiness | null | undefined,
  opts?: { connectLoading?: boolean; readinessLoading?: boolean },
): LiveSalesGate {
  if (opts?.connectLoading || opts?.readinessLoading) {
    return {
      blocked: true,
      bannerMessage: null,
      alertTitle: 'Checking setup',
      alertBody: 'One moment while we verify your seller setup from the server.',
      nextStep: null,
    };
  }

  if (readiness) {
    if (readiness.canGoLive) {
      return {
        blocked: false,
        bannerMessage: null,
        alertTitle: 'Ready to go live',
        alertBody: '',
        nextStep: null,
      };
    }
    const issues = readiness.issues.filter((i) => i.trim().length > 0);
    const checks = readiness.checks ?? {};
    const nextStep = getNextLiveReadinessStep(checks);
    const bannerMessage =
      issues[0] ??
      (nextStep === 'ship_from'
        ? 'Add a complete shipping address before hosting live events.'
        : 'Finish payout setup before scheduling or hosting live events.');
    return {
      blocked: true,
      bannerMessage,
      alertTitle: nextStep === 'ship_from' ? 'Shipping address required' : 'Payout setup required',
      alertBody: issues.length > 0 ? issues.join('\n\n') : bannerMessage,
      nextStep: nextStep === 'ready' ? null : nextStep,
    };
  }

  // Readiness API failed or never loaded — do not infer "Ready" from Stripe connect alone.
  return {
    blocked: true,
    bannerMessage: 'Could not verify go-live readiness. Pull to refresh or try again.',
    alertTitle: 'Setup check unavailable',
    alertBody:
      'We could not confirm payout and shipping setup from the server. Check your connection, then open Create Vault Event again.',
    nextStep: null,
  };
}
