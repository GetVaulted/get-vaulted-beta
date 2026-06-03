import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';
import { fetchSellerConnectStatus, isSellerPayoutSetupComplete } from '../api/stripeConnectRepository';
import { fetchSellerAccount } from '../api/sellerAccountRepository';
import {
  isPayoutSetupComplete,
  normalizeSellerReadinessChecks,
  type SellerReadinessChecks,
} from './seller-setup-state';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Payout step complete — seller account readiness and/or live Connect status. */
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

export type ReconcilePayoutResult = {
  complete: boolean;
  checks: SellerReadinessChecks | null;
  connect: SellerConnectStatusResponse | null;
};

/**
 * Poll seller + Connect status after Stripe hosted onboarding return.
 * Stripe and webhooks can lag a few seconds behind the redirect.
 */
export async function reconcileSellerPayoutAfterStripe(
  accessToken: string,
  opts?: { maxAttempts?: number; delayMs?: number; shouldAbort?: () => boolean },
): Promise<ReconcilePayoutResult> {
  const maxAttempts = opts?.maxAttempts ?? 10;
  const delayMs = opts?.delayMs ?? 1200;
  const shouldAbort = opts?.shouldAbort;

  let checks: SellerReadinessChecks | null = null;
  let connect: SellerConnectStatusResponse | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (shouldAbort?.()) break;
    const [connectResult, accountResult] = await Promise.all([
      fetchSellerConnectStatus(accessToken),
      fetchSellerAccount(accessToken).catch(() => null),
    ]);

    connect = connectResult.status;
    checks = accountResult
      ? normalizeSellerReadinessChecks(accountResult.readiness?.checks as Record<string, boolean> | undefined)
      : null;

    if (isWizardPayoutStepComplete(checks, connect)) {
      return { complete: true, checks, connect };
    }

    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }

  return {
    complete: isWizardPayoutStepComplete(checks, connect),
    checks,
    connect,
  };
}
