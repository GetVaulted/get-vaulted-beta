import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';
import { isSellerPayoutSetupComplete } from '../api/stripeConnectRepository';

export type SellerHQEntryPhase = 'guest' | 'become_seller' | 'finish_setup' | 'ready';

export function hasStartedSellerSetup(status: SellerConnectStatusResponse | null | undefined): boolean {
  if (!status) return false;
  if (status.stripe_account_id?.trim()) return true;
  if (status.stripeConfigured) return true;
  return status.onboarding_ui_status !== 'not_started';
}

/** Seller can use HQ tools (listings, live, payouts in progress or complete). */
export function isSellerHQApproved(status: SellerConnectStatusResponse | null | undefined): boolean {
  if (!status) return false;
  if (isSellerPayoutSetupComplete(status)) return true;
  return Boolean(status.can_host_live_sales || status.can_publish_active_listings);
}

export function resolveSellerHQEntryPhase(args: {
  hasUser: boolean;
  connect: SellerConnectStatusResponse | null;
}): SellerHQEntryPhase {
  if (!args.hasUser) return 'guest';
  if (isSellerHQApproved(args.connect)) return 'ready';
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
        title: 'Vault HQ',
        body: 'Your seller console — listings, live shows, orders, wallet, and stream tools.',
        cta: 'Enter Seller HQ',
        icon: 'checkmark-circle-outline',
      };
  }
}
