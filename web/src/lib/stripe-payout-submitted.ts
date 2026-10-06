/** Hosted Connect onboarding was submitted; Stripe may still be verifying identity. */
export function isStripePayoutSetupSubmitted(args: {
  hasStripeAccount: boolean;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled?: boolean | null;
  stripePayoutsEnabled?: boolean | null;
  currentlyDue?: string[] | null;
  pendingVerification?: string[] | null;
}): boolean {
  if (!args.hasStripeAccount) return false;
  if (args.stripeOnboardingComplete) return true;
  const currentlyDue = args.currentlyDue ?? [];
  if (currentlyDue.length > 0) return false;
  const pendingVerification = args.pendingVerification ?? [];
  if (pendingVerification.length > 0) return true;
  return args.stripeChargesEnabled === true || args.stripePayoutsEnabled === true;
}

/** Live Stripe Account — details submitted and nothing currently due (pending_verification OK). */
export function isStripePayoutSetupSubmittedFromAccount(account: {
  details_submitted?: boolean | null;
  requirements?: { currently_due?: string[] | null } | null;
}): boolean {
  return Boolean(account.details_submitted) && (account.requirements?.currently_due?.length ?? 0) === 0;
}
