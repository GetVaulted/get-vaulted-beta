import { isPayoutSetupSubmitted, type SellerReadinessChecks } from './seller-setup-state';

export const SELLER_WIZARD_TOTAL_STEPS = 5;

export type SellerWizardStep = 1 | 2 | 3 | 4 | 5;

export function resolveSellerWizardStep(input: {
  checks: SellerReadinessChecks | null | undefined;
  wizardComplete: boolean;
  sellerAgreementAccepted: boolean;
}): SellerWizardStep {
  const checks = input.checks;
  const payoutsDone = isPayoutSetupSubmitted(checks);
  const shippingDone = Boolean(checks?.hasShipFromAddress);
  const started = Boolean(checks?.hasStripeAccount || checks?.hasShipFromAddress);

  if (!started && !payoutsDone) return 1;
  if (!payoutsDone) return 2;
  if (!shippingDone) return 3;
  if (!input.sellerAgreementAccepted || !input.wizardComplete) return 4;
  return 5;
}

export const WIZARD_STEP_LABELS: Record<SellerWizardStep, string> = {
  1: 'Welcome',
  2: 'Payout setup',
  3: 'Shipping address',
  4: 'Seller profile',
  5: 'Complete',
};
