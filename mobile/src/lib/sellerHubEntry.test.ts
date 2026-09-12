import { describe, expect, it } from 'vitest';
import {
  computeSellerStudioReadinessProgress,
  isSellerPayoutSetupSubmitted,
  resolveSellerHQEntryPhase,
} from './sellerHubEntry';
import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';

function connect(partial: Partial<SellerConnectStatusResponse>): SellerConnectStatusResponse {
  return {
    stripeConfigured: true,
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    stripe_charges_enabled: null,
    stripe_payouts_enabled: null,
    stripe_requirements_due: null,
    stripe_verification_status: null,
    onboarding_ui_status: 'not_started',
    can_publish_active_listings: false,
    can_host_live_sales: false,
    payouts_ready: false,
    message_onboarding: null,
    message_payouts: null,
    ...partial,
  };
}

describe('computeSellerStudioReadinessProgress', () => {
  it('stays at 65% when Connect account exists but nothing is submitted', () => {
    expect(
      computeSellerStudioReadinessProgress(
        connect({ stripe_account_id: 'acct_1', onboarding_ui_status: 'in_progress' }),
      ),
    ).toBe(0.65);
  });

  it('is 100% when payout details are submitted (pending Stripe review)', () => {
    expect(
      computeSellerStudioReadinessProgress(
        connect({
          stripe_account_id: 'acct_1',
          payout_setup_submitted: true,
          onboarding_ui_status: 'pending_review',
        }),
      ),
    ).toBe(1);
  });

  it('is 100% when sellerActivated even if Stripe is not fully cleared to sell', () => {
    expect(
      computeSellerStudioReadinessProgress(
        connect({ stripe_account_id: 'acct_1', onboarding_ui_status: 'pending_review' }),
        { sellerActivated: true },
      ),
    ).toBe(1);
  });
});

describe('resolveSellerHQEntryPhase', () => {
  it('treats activated sellers as ready', () => {
    expect(
      resolveSellerHQEntryPhase({
        hasUser: true,
        connect: connect({ stripe_account_id: 'acct_1', onboarding_ui_status: 'pending_review' }),
        sellerActivated: true,
      }),
    ).toBe('ready');
  });
});

describe('isSellerPayoutSetupSubmitted', () => {
  it('is true for pending_review', () => {
    expect(
      isSellerPayoutSetupSubmitted(
        connect({ stripe_account_id: 'acct_1', onboarding_ui_status: 'pending_review' }),
      ),
    ).toBe(true);
  });
});
