import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchSellerAccount,
  type SellerAccountPayload,
  type SellerAccountResponse,
} from '../api/sellerAccountRepository';
import type { SellerLiveReadiness } from '../api/liveHostRepository';
import {
  isRequiredSellerSetupComplete,
  isSellerActivated,
  logSellerSetupTransition,
  normalizeSellerReadinessChecks,
  resolveSellerLifecycleState,
  resolveSellerSetupPhase,
  resolveWizardCompleteFromSources,
  type SellerLifecycleState,
  type SellerReadinessChecks,
  type SellerSetupDataSource,
  type SellerSetupPhase,
} from '../lib/seller-setup-state';
import {
  clearSellerWizardComplete,
  markSellerHqActivatedLocal,
  markSellerWizardCompleteLocal,
  readSellerHqActivated,
  readSellerWizardComplete,
} from '../lib/sellerWizardStorage';

const DEFAULT_CHECKS: SellerReadinessChecks = {
  hasStripeAccount: false,
  stripeChargesEnabled: false,
  stripePayoutSubmitted: false,
  hasShipFromAddress: false,
};

const GATE_DEBOUNCE_MS = 450;
const LOAD_TIMEOUT_MS = 15_000;

type SellerSetupStore = {
  phase: SellerSetupPhase;
  lifecycle: SellerLifecycleState;
  checks: SellerReadinessChecks | null;
  wizardComplete: boolean;
  serverWizardConfirmed: boolean;
  sellerSetupWizardCompletedAt: string | null;
  sellerAgreementAcceptedAt: string | null;
  canGoLive: boolean;
  seller: SellerAccountPayload | null;
  stripePlatformConfigured: boolean;
  activated: boolean;
  wasEverActivated: boolean;
  isRefreshing: boolean;
  hasLoaded: boolean;
  showSetupGate: boolean;
};

const EMPTY_STORE: SellerSetupStore = {
  phase: 'not_started',
  lifecycle: 'NOT_STARTED',
  checks: null,
  wizardComplete: false,
  serverWizardConfirmed: false,
  sellerSetupWizardCompletedAt: null,
  sellerAgreementAcceptedAt: null,
  canGoLive: false,
  seller: null,
  stripePlatformConfigured: false,
  activated: false,
  wasEverActivated: false,
  isRefreshing: false,
  hasLoaded: false,
  showSetupGate: false,
};

let store: SellerSetupStore = { ...EMPTY_STORE };
let gateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflightLoad: Promise<SellerReadinessChecks | null> | null = null;
let activeAccessToken: string | null = null;
let subscribedAccessToken: string | null = null;
let subscribedUserId: string | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SellerSetupStore {
  return store;
}

function displayActivated(s: SellerSetupStore): boolean {
  return s.activated || (s.isRefreshing && s.wasEverActivated);
}

/** Whether seller HQ / create listing should stay unlocked (sticky during refresh). */
export function isSellerSetupUnlocked(s: SellerSetupStore = store): boolean {
  return displayActivated(s) || (s.wasEverActivated && s.serverWizardConfirmed);
}

function computeShowSetupGate(s: SellerSetupStore): boolean {
  if (displayActivated(s)) return false;
  if (isSellerSetupUnlocked(s)) return false;
  if (s.wizardComplete) return false;
  if (!s.hasLoaded) return false;
  if (s.isRefreshing && s.wasEverActivated) return false;
  if (s.phase === 'loading' && s.wasEverActivated) return false;
  return true;
}

function scheduleSetupGateUpdate() {
  if (gateDebounceTimer) {
    clearTimeout(gateDebounceTimer);
    gateDebounceTimer = null;
  }

  const immediate = computeShowSetupGate(store);
  if (store.activated || displayActivated(store)) {
    if (store.showSetupGate !== false) {
      store = { ...store, showSetupGate: false };
      emit();
    }
    return;
  }

  gateDebounceTimer = setTimeout(() => {
    gateDebounceTimer = null;
    const showGate = computeShowSetupGate(store);
    if (showGate !== store.showSetupGate) {
      store = { ...store, showSetupGate: showGate };
      emit();
    }
  }, GATE_DEBOUNCE_MS);
}

function publish(next: SellerSetupStore, source: SellerSetupDataSource) {
  const previousLifecycle = store.lifecycle;
  logSellerSetupTransition({
    previousLifecycle,
    nextLifecycle: next.lifecycle,
    source,
    sellerSetupWizardCompletedAt: next.sellerSetupWizardCompletedAt,
    activated: next.activated,
  });
  store = next;
  emit();
  scheduleSetupGateUpdate();
}

function assembleStore(input: {
  checks: SellerReadinessChecks;
  wizardComplete: boolean;
  serverWizardConfirmed: boolean;
  sellerSetupWizardCompletedAt: string | null;
  sellerAgreementAcceptedAt: string | null;
  canGoLive: boolean;
  seller: SellerAccountPayload | null;
  stripePlatformConfigured: boolean;
  isRefreshing: boolean;
  hasLoaded: boolean;
  initialLoad?: boolean;
}): SellerSetupStore {
  const activated = isSellerActivated(input.checks, input.wizardComplete);
  const wasEverActivated = store.wasEverActivated || activated;
  const loading = Boolean(input.initialLoad && !wasEverActivated);
  const phase = resolveSellerSetupPhase(input.checks, loading, input.wizardComplete);
  const lifecycle = resolveSellerLifecycleState({
    checks: input.checks,
    wizardComplete: input.wizardComplete,
    canGoLive: input.canGoLive,
    loading: loading && !wasEverActivated,
  });

  const draft: SellerSetupStore = {
    phase: input.isRefreshing && wasEverActivated ? 'ready' : phase,
    lifecycle: input.isRefreshing && wasEverActivated && activated ? store.lifecycle : lifecycle,
    checks: input.checks,
    wizardComplete: input.wizardComplete,
    serverWizardConfirmed: input.serverWizardConfirmed,
    sellerSetupWizardCompletedAt: input.sellerSetupWizardCompletedAt,
    sellerAgreementAcceptedAt: input.sellerAgreementAcceptedAt,
    canGoLive: input.canGoLive,
    seller: input.seller,
    stripePlatformConfigured: input.stripePlatformConfigured,
    activated,
    wasEverActivated,
    isRefreshing: input.isRefreshing,
    hasLoaded: input.hasLoaded,
    showSetupGate: store.showSetupGate,
  };

  return { ...draft, showSetupGate: computeShowSetupGate(draft) };
}

function applyServerPayload(
  payload: SellerAccountResponse,
  localWizard: boolean,
  userId: string | undefined,
): SellerReadinessChecks {
  const readiness = payload.readiness as SellerLiveReadiness | undefined;
  const nextChecks = normalizeSellerReadinessChecks(readiness?.checks);
  const wizardAt = payload.sellerSetupWizardCompletedAt ?? null;
  const wizardResolved = resolveWizardCompleteFromSources({
    sellerSetupWizardCompletedAt: wizardAt,
    setupWizardComplete: payload.setupWizardComplete,
    localWizardComplete: localWizard,
    stickyServerConfirmed: store.serverWizardConfirmed,
    serverResponded: true,
  });

  if (wizardResolved.serverWizardConfirmed && !localWizard) {
    void markSellerWizardCompleteLocal(userId);
  }
  if (wizardResolved.serverExplicitIncomplete && localWizard) {
    void clearSellerWizardComplete(userId);
  }

  const agreementAt = payload.sellerAgreementAcceptedAt ?? null;
  const next = assembleStore({
    checks: nextChecks,
    wizardComplete: wizardResolved.wizardComplete,
    serverWizardConfirmed: wizardResolved.serverWizardConfirmed,
    sellerSetupWizardCompletedAt: wizardAt,
    sellerAgreementAcceptedAt: agreementAt,
    canGoLive: Boolean(readiness?.canGoLive),
    seller: payload.seller,
    stripePlatformConfigured: payload.stripePlatformConfigured === true,
    isRefreshing: false,
    hasLoaded: true,
  });

  publish(next, 'server');
  if (next.activated) void markSellerHqActivatedLocal(userId);
  return nextChecks;
}

async function runLoad(
  accessToken: string | undefined,
  userId: string | undefined,
  enabled: boolean,
  opts?: { silent?: boolean },
): Promise<SellerReadinessChecks | null> {
  const silent = opts?.silent === true;
  const requestToken = accessToken ?? null;

  if (!enabled) {
    activeAccessToken = null;
    publish({ ...EMPTY_STORE }, 'cache');
    return null;
  }
  if (!accessToken) {
    return store.checks;
  }

  activeAccessToken = requestToken;

  const [localWizard, hqActivated] = await Promise.all([
    readSellerWizardComplete(userId),
    readSellerHqActivated(userId),
  ]);
  if ((localWizard || hqActivated) && !store.wasEverActivated) {
    store = {
      ...store,
      wasEverActivated: true,
      wizardComplete: store.wizardComplete || localWizard,
    };
    emit();
  }

  if (!silent && !store.hasLoaded && !store.wasEverActivated) {
    publish(
      assembleStore({
        checks: store.checks ?? DEFAULT_CHECKS,
        wizardComplete: store.wizardComplete,
        serverWizardConfirmed: store.serverWizardConfirmed,
        sellerSetupWizardCompletedAt: store.sellerSetupWizardCompletedAt,
        sellerAgreementAcceptedAt: store.sellerAgreementAcceptedAt,
        canGoLive: store.canGoLive,
        seller: store.seller,
        stripePlatformConfigured: store.stripePlatformConfigured,
        isRefreshing: false,
        hasLoaded: false,
        initialLoad: true,
      }),
      'loading',
    );
  } else if (!silent && !store.hasLoaded && store.wasEverActivated) {
    publish({ ...store, isRefreshing: true, phase: 'ready' }, 'cache');
  } else if (silent) {
    publish({ ...store, isRefreshing: true }, 'cache');
  }

  try {
    const payload = await Promise.race([
      fetchSellerAccount(accessToken),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Seller setup timed out. Check your connection and pull to refresh.')),
          LOAD_TIMEOUT_MS,
        );
      }),
    ]);
    if (activeAccessToken !== requestToken) return store.checks;
    return applyServerPayload(payload, localWizard, userId);
  } catch {
    if (activeAccessToken !== requestToken) return store.checks;
    const wizardResolved = resolveWizardCompleteFromSources({
      localWizardComplete: localWizard,
      stickyServerConfirmed: store.serverWizardConfirmed,
      serverResponded: false,
    });
    const next = assembleStore({
      checks: store.checks ?? DEFAULT_CHECKS,
      wizardComplete: wizardResolved.wizardComplete,
      serverWizardConfirmed: wizardResolved.serverWizardConfirmed,
      sellerSetupWizardCompletedAt: store.sellerSetupWizardCompletedAt,
      sellerAgreementAcceptedAt: store.sellerAgreementAcceptedAt,
      canGoLive: store.canGoLive,
      seller: store.seller,
      stripePlatformConfigured: store.stripePlatformConfigured,
      isRefreshing: false,
      hasLoaded:
        store.hasLoaded ||
        store.wasEverActivated ||
        store.serverWizardConfirmed ||
        wizardResolved.wizardComplete ||
        localWizard,
    });
    publish(next, 'error');
    return next.checks;
  }
}

function requestLoad(
  accessToken: string | undefined,
  userId: string | undefined,
  enabled: boolean,
  opts?: { silent?: boolean },
) {
  if (inflightLoad) {
    void inflightLoad.then(() => requestLoad(accessToken, userId, enabled, opts));
    return inflightLoad;
  }
  inflightLoad = runLoad(accessToken, userId, enabled, opts).finally(() => {
    inflightLoad = null;
  });
  return inflightLoad;
}

/** Read shared seller setup snapshot (e.g. navigation guards). */
export function getSellerSetupSnapshot(): Readonly<SellerSetupStore> {
  return store;
}

export function useSellerSetupState(
  accessToken: string | undefined,
  userId: string | undefined,
  enabled: boolean,
) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const load = useCallback(
    (opts?: { silent?: boolean }) => requestLoad(accessToken, userId, enabled, opts),
    [accessToken, userId, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      subscribedAccessToken = null;
      subscribedUserId = null;
      publish({ ...EMPTY_STORE }, 'cache');
      return;
    }
    if (!accessToken) return;
    // A DIFFERENT signed-in user appearing on this same device (logout -> different account login
    // without a force-quit) must hard-reset the shared singleton store immediately — otherwise the
    // new user would transiently inherit the previous user's `wasEverActivated` /
    // `serverWizardConfirmed` sticky flags (and therefore skip the seller setup gate) for the
    // instant before the fresh fetch below resolves. See cross-account data-leak audit, 2026-07.
    const userChanged = Boolean(subscribedUserId && userId && subscribedUserId !== userId);
    if (userChanged) {
      store = { ...EMPTY_STORE };
      emit();
    }
    const tokenChanged = Boolean(subscribedAccessToken && subscribedAccessToken !== accessToken);
    subscribedAccessToken = accessToken;
    subscribedUserId = userId ?? null;
    void requestLoad(accessToken, userId, enabled, {
      silent: !userChanged && tokenChanged && (store.hasLoaded || store.wasEverActivated),
    });
  }, [accessToken, userId, enabled]);

  useEffect(() => {
    if (!enabled || !accessToken) return undefined;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void requestLoad(accessToken, userId, enabled, { silent: true });
      }
    });
    return () => sub.remove();
  }, [accessToken, userId, enabled]);

  const applyReadinessFromServer = useCallback(
    (readiness: SellerLiveReadiness | undefined, nextSeller?: SellerAccountPayload | null) => {
      if (!readiness?.checks) return;
      const nextChecks = normalizeSellerReadinessChecks(readiness.checks as Record<string, boolean>);
      const next = assembleStore({
        checks: nextChecks,
        wizardComplete: store.wizardComplete,
        serverWizardConfirmed: store.serverWizardConfirmed,
        sellerSetupWizardCompletedAt: store.sellerSetupWizardCompletedAt,
        sellerAgreementAcceptedAt: store.sellerAgreementAcceptedAt,
        canGoLive: Boolean(readiness.canGoLive),
        seller: nextSeller !== undefined ? nextSeller : store.seller,
        stripePlatformConfigured: store.stripePlatformConfigured,
        isRefreshing: false,
        hasLoaded: true,
      });
      publish(next, 'server');
    },
    [],
  );

  const setWizardCompleteLocal = useCallback((done: boolean) => {
    if (!store.checks) {
      publish({ ...store, wizardComplete: done }, 'cache');
      return;
    }
    const next = assembleStore({
      checks: store.checks,
      wizardComplete: done,
      serverWizardConfirmed: done ? true : store.serverWizardConfirmed,
      sellerSetupWizardCompletedAt: done ? new Date().toISOString() : store.sellerSetupWizardCompletedAt,
      sellerAgreementAcceptedAt: done
        ? store.sellerAgreementAcceptedAt ?? new Date().toISOString()
        : store.sellerAgreementAcceptedAt,
      canGoLive: store.canGoLive,
      seller: store.seller,
      stripePlatformConfigured: store.stripePlatformConfigured,
      isRefreshing: false,
      hasLoaded: store.hasLoaded,
    });
    publish(next, 'cache');
  }, []);

  const showInitialLoading =
    snapshot.phase === 'loading' && !snapshot.hasLoaded && !snapshot.wasEverActivated;

  return {
    phase: snapshot.phase,
    lifecycle: snapshot.lifecycle,
    checks: snapshot.checks,
    wizardComplete: snapshot.wizardComplete,
    sellerSetupWizardCompletedAt: snapshot.sellerSetupWizardCompletedAt,
    sellerAgreementAcceptedAt: snapshot.sellerAgreementAcceptedAt,
    canGoLive: snapshot.canGoLive,
    seller: snapshot.seller,
    stripePlatformConfigured: snapshot.stripePlatformConfigured,
    isRefreshing: snapshot.isRefreshing,
    showSetupGate: snapshot.showSetupGate,
    showInitialLoading,
    displayActivated: displayActivated(snapshot),
    requiredComplete: isRequiredSellerSetupComplete(snapshot.checks),
    activated: snapshot.activated,
    refetch: () => load(),
    refetchSilent: () => load({ silent: true }),
    applyReadinessFromServer,
    setWizardCompleteLocal,
  };
}

/** @internal Reset shared store — for tests only. */
export function resetSellerSetupStoreForTests(): void {
  if (gateDebounceTimer) clearTimeout(gateDebounceTimer);
  gateDebounceTimer = null;
  inflightLoad = null;
  activeAccessToken = null;
  subscribedAccessToken = null;
  subscribedUserId = null;
  store = { ...EMPTY_STORE };
  emit();
}
