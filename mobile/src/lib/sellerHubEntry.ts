import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';

export type SellerHQEntryPhase = 'guest' | 'become_seller' | 'finish_setup' | 'ready';

export function hasStartedSellerSetup(status: SellerConnectStatusResponse | null | undefined): boolean {
  if (!status) return false;
  if (status.stripe_account_id?.trim()) return true;
  if (status.stripeConfigured) return true;
  return status.onboarding_ui_status !== 'not_started';
}

/** Stripe cleared to sell/publish — not the same as wizard/HQ unlock. */
export function isSellerHQApproved(status: SellerConnectStatusResponse | null | undefined): boolean {
  if (!status) return false;
  if (status.can_publish_active_listings && status.payouts_ready) return true;
  return Boolean(status.can_host_live_sales || status.can_publish_active_listings);
}

/** Hosted Connect submitted (pending Stripe review OK) — seller setup payout step done. */
export function isSellerPayoutSetupSubmitted(
  status: SellerConnectStatusResponse | null | undefined,
): boolean {
  if (!status?.stripe_account_id?.trim()) return false;
  if (isSellerHQApproved(status)) return true;
  return Boolean(
    status.payout_setup_submitted ||
      status.payout_setup_complete ||
      status.stripe_onboarding_complete ||
      status.onboarding_ui_status === 'pending_review' ||
      status.onboarding_ui_status === 'verified',
  );
}

/**
 * Studio readiness bar. Once setup is finished (activated / submitted), show 100% —
 * do not stick at 65% just because Stripe verification is still pending.
 */
export function computeSellerStudioReadinessProgress(
  connect: SellerConnectStatusResponse | null | undefined,
  opts?: { sellerActivated?: boolean; wizardComplete?: boolean },
): number {
  if (opts?.sellerActivated || opts?.wizardComplete) return 1;
  if (isSellerHQApproved(connect)) return 1;
  if (isSellerPayoutSetupSubmitted(connect)) return 1;
  if (!connect) return 0.15;
  if (connect.stripe_account_id?.trim()) return 0.65;
  if (connect.stripeConfigured) return 0.45;
  return 0.25;
}

export function resolveSellerHQEntryPhase(args: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
  sellerActivated?: boolean;
  wizardComplete?: boolean;
}): SellerHQEntryPhase {
  if (!args.hasUser) return 'guest';
  if (args.sellerActivated || args.wizardComplete || isSellerHQApproved(args.connect)) return 'ready';
  if (hasStartedSellerSetup(args.connect)) return 'finish_setup';
  return 'become_seller';
}

export function sellerHQEntryCopy(phase: SellerHQEntryPhase): {
  title: string;
  body: string;
  cta: string;
  icon: 'shield-outline' | 'storefront-outline' | 'construct-outline' | 'checkmark-circle-outline';
} {
  switch (phase) {
    case 'guest':
      return {
        title: 'Sell on Get Vaulted',
        body: 'Create a seller account to list inventory, run live shows, and get paid.',
        cta: 'Become a Seller',
        icon: 'storefront-outline',
      };
    case 'become_seller':
      return {
        title: 'Become a Seller',
        body: 'Set up payouts and your vault profile to publish listings and go live.',
        cta: 'Start Seller Setup',
        icon: 'storefront-outline',
      };
    case 'finish_setup':
      return {
        title: 'Finish Seller Setup',
        body: 'Complete Stripe payout setup so you can publish listings and host live shows.',
        cta: 'Finish Seller Setup',
        icon: 'construct-outline',
      };
    case 'ready':
      return {
        title: 'Seller Studio',
        body: 'Vault events, inventory, revenue vault, and fulfillment — your seller operating system.',
        cta: 'Open Seller Studio',
        icon: 'checkmark-circle-outline',
      };
  }
}
