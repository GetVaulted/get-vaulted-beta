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
  const stripeOk = checks.hasStripeAccount !== false && checks.stripeChargesEnabled !== false;
  if (!stripeOk) return 'stripe';
  if (!checks.hasShipFromAddress) return 'ship_from';
  return 'ready';
}

/**
 * Single gate for schedule / host entry on mobile — prefers `/api/seller/live-readiness`
 * (Stripe + ship-from) and falls back to Connect status when readiness is unavailable.
 */
export function resolveLiveSalesGate(
  connect: SellerConnectStatusResponse | null | undefined,
  readiness: SellerLiveReadiness | null | undefined,
  opts?: { connectLoading?: boolean; readinessLoading?: boolean },
): LiveSalesGate {
  if (opts?.connectLoading || opts?.readinessLoading) {
    return {
      blocked: false,
      bannerMessage: null,
      alertTitle: 'Checking setup',
      alertBody: 'One moment while we verify your seller setup.',
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

  const stripeConfigured = connect?.stripeConfigured === true;
  const stripeBlocked = stripeConfigured && connect?.can_host_live_sales === false;
  if (stripeBlocked) {
    const body =
      connect?.message_onboarding?.trim() ||
      connect?.message_payouts?.trim() ||
      'Finish Stripe payout setup before scheduling or hosting live events.';
    return {
      blocked: true,
      bannerMessage: body,
      alertTitle: 'Payout setup required',
      alertBody: body,
      nextStep: 'stripe',
    };
  }

  return {
    blocked: false,
    bannerMessage: null,
    alertTitle: 'Ready to go live',
    alertBody: '',
    nextStep: null,
  };
}
