/** Score Prisma User Stripe Connect fields — higher = fuller payout readiness. */

export type StripeConnectSnapshotFields = {
  stripeAccountId: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean | null;
  stripePayoutsEnabled?: boolean | null;
};

export function stripeConnectSnapshotScore(row: StripeConnectSnapshotFields): number {
  let score = 0;
  if (row.stripeAccountId?.trim()) score += 1;
  if (row.stripeOnboardingComplete) score += 4;
  if (row.stripeChargesEnabled === true) score += 2;
  if (row.stripePayoutsEnabled === true) score += 2;
  return score;
}
