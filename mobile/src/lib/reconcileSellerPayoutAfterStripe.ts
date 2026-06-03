import type { SellerConnectStatusResponse } from '../api/stripeConnectRepository';
import {
  fetchSellerConnectStatus,
  refreshSellerStripeFromApi,
} from '../api/stripeConnectRepository';
import { fetchSellerAccount } from '../api/sellerAccountRepository';
import {
  isWizardPayoutStepComplete,
  logSellerStripeConnectStatus,
  resolvePayoutReconcileUiState,
  type PayoutReconcileUiState,
} from './seller-stripe-connect-status';
import {
  normalizeSellerReadinessChecks,
  type SellerReadinessChecks,
} from './seller-setup-state';

export { isWizardPayoutStepComplete } from './seller-stripe-connect-status';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ReconcilePayoutResult = {
  complete: boolean;
  checks: SellerReadinessChecks | null;
  connect: SellerConnectStatusResponse | null;
  connectError: string | null;
  uiState: PayoutReconcileUiState;
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
  let connectError: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (shouldAbort?.()) break;

    if (attempt === 0) {
      await refreshSellerStripeFromApi(accessToken).catch((e) => {
        if (__DEV__) {
          console.warn(
            '[seller-setup] stripe-status refresh failed',
            e instanceof Error ? e.message : String(e),
          );
        }
      });
    }

    const [connectResult, accountResult] = await Promise.all([
      fetchSellerConnectStatus(accessToken),
      fetchSellerAccount(accessToken).catch(() => null),
    ]);

    connect = connectResult.status;
    connectError = connectResult.error;
    checks = accountResult
      ? normalizeSellerReadinessChecks(accountResult.readiness?.checks as Record<string, boolean> | undefined)
      : null;

    logSellerStripeConnectStatus(connect, 'reconcile_attempt', {
      attempt: attempt + 1,
      maxAttempts,
      connectError,
      wizardComplete: isWizardPayoutStepComplete(checks, connect),
    });

    if (isWizardPayoutStepComplete(checks, connect)) {
      const uiState = resolvePayoutReconcileUiState(connect, checks, connectError);
      return { complete: true, checks, connect, connectError, uiState };
    }

    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }

  const complete = isWizardPayoutStepComplete(checks, connect);
  const uiState = resolvePayoutReconcileUiState(connect, checks, connectError);
  logSellerStripeConnectStatus(connect, 'reconcile_final', { complete, uiState, connectError });

  return { complete, checks, connect, connectError, uiState };
}
