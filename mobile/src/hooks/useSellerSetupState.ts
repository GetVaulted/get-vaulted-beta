import { useCallback, useEffect, useState } from 'react';
import { fetchSellerAccount } from '../api/sellerAccountRepository';
import type { SellerLiveReadiness } from '../api/liveHostRepository';
import {
  isRequiredSellerSetupComplete,
  isSellerActivated,
  normalizeSellerReadinessChecks,
  resolveSellerLifecycleState,
  resolveSellerSetupPhase,
  type SellerLifecycleState,
  type SellerReadinessChecks,
  type SellerSetupPhase,
} from '../lib/seller-setup-state';
import { readSellerWizardComplete, markSellerWizardCompleteLocal } from '../lib/sellerWizardStorage';

const DEFAULT_CHECKS: SellerReadinessChecks = {
  hasStripeAccount: false,
  stripeChargesEnabled: false,
  hasShipFromAddress: false,
};

export function useSellerSetupState(accessToken: string | undefined, enabled: boolean) {
  const [phase, setPhase] = useState<SellerSetupPhase>(enabled ? 'loading' : 'not_started');
  const [lifecycle, setLifecycle] = useState<SellerLifecycleState>('NOT_STARTED');
  const [checks, setChecks] = useState<SellerReadinessChecks | null>(null);
  const [wizardComplete, setWizardComplete] = useState(false);
  const [canGoLive, setCanGoLive] = useState(false);
  const [seller, setSeller] = useState<Awaited<ReturnType<typeof fetchSellerAccount>>['seller'] | null>(null);
  const [stripePlatformConfigured, setStripePlatformConfigured] = useState(false);

  const apply = useCallback(
    (nextChecks: SellerReadinessChecks, wizardDone: boolean, liveReady: boolean, nextSeller: typeof seller) => {
      setChecks(nextChecks);
      setWizardComplete(wizardDone);
      setCanGoLive(liveReady);
      setSeller(nextSeller);
      setPhase(resolveSellerSetupPhase(nextChecks, false, wizardDone));
      setLifecycle(
        resolveSellerLifecycleState({
          checks: nextChecks,
          wizardComplete: wizardDone,
          canGoLive: liveReady,
          loading: false,
        }),
      );
    },
    [],
  );

  const load = useCallback(async () => {
    if (!enabled || !accessToken) {
      setPhase('not_started');
      setLifecycle('NOT_STARTED');
      setChecks(null);
      setWizardComplete(false);
      setSeller(null);
      return;
    }
    setPhase('loading');
    try {
      const localWizard = await readSellerWizardComplete();
      const payload = await fetchSellerAccount(accessToken);
      const readiness = payload.readiness as SellerLiveReadiness | undefined;
      const nextChecks = normalizeSellerReadinessChecks(readiness?.checks);
      const serverWizard = payload.setupWizardComplete === true;
      if (serverWizard && !localWizard) await markSellerWizardCompleteLocal();
      const wizardDone = serverWizard || localWizard;
      setStripePlatformConfigured(payload.stripePlatformConfigured === true);
      apply(nextChecks, wizardDone, Boolean(readiness?.canGoLive), payload.seller);
    } catch {
      const localWizard = await readSellerWizardComplete();
      apply(DEFAULT_CHECKS, localWizard, false, null);
    }
  }, [accessToken, enabled, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    phase,
    lifecycle,
    checks,
    wizardComplete,
    canGoLive,
    seller,
    stripePlatformConfigured,
    requiredComplete: isRequiredSellerSetupComplete(checks),
    activated: isSellerActivated(checks, wizardComplete),
    refetch: load,
    setWizardCompleteLocal: (done: boolean) => {
      setWizardComplete(done);
      if (checks) {
        setPhase(resolveSellerSetupPhase(checks, false, done));
        setLifecycle(
          resolveSellerLifecycleState({
            checks,
            wizardComplete: done,
            canGoLive,
            loading: false,
          }),
        );
      }
    },
  };
}
