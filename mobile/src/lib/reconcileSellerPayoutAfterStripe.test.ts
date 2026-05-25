import { describe, expect, it } from 'vitest';
import { isWizardPayoutStepComplete } from './reconcileSellerPayoutAfterStripe';

describe('isWizardPayoutStepComplete', () => {
  it('returns true when seller readiness checks show charges enabled', () => {
    expect(
      isWizardPayoutStepComplete(
        { hasStripeAccount: true, stripeChargesEnabled: true, hasShipFromAddress: false },
        null,
      ),
    ).toBe(true);
  });

  it('returns true when connect status shows onboarding submitted', () => {
    expect(
      isWizardPayoutStepComplete(null, {
        stripeConfigured: true,
        stripe_account_id: 'acct_1',
        stripe_onboarding_complete: true,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_requirements_due: null,
        stripe_verification_status: null,
        onboarding_ui_status: 'pending_review',
        can_publish_active_listings: false,
        can_host_live_sales: false,
        payouts_ready: false,
        payout_setup_submitted: true,
        message_onboarding: null,
        message_payouts: null,
      }),
    ).toBe(true);
  });

  it('returns false when neither checks nor connect show progress', () => {
    expect(isWizardPayoutStepComplete(null, null)).toBe(false);
  });
});
