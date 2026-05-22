/**
 * Throttle live discovery refetches so tab focus / poll / invalidation do not hammer the API
 * (which can trigger edge WAF 403s) or wipe UI state on transient failures.
 */
const MIN_INTERVAL_OK_MS = 12_000;
const BASE_FAILURE_BACKOFF_MS = 45_000;
const MAX_FAILURE_BACKOFF_MS = 3 * 60_000;

const state = {
  lastAttemptMs: 0,
  consecutiveFailures: 0,
  lastError: null as string | null,
};

function backoffMs(): number {
  if (state.consecutiveFailures <= 0) return MIN_INTERVAL_OK_MS;
  return Math.min(
    MAX_FAILURE_BACKOFF_MS,
    BASE_FAILURE_BACKOFF_MS * 2 ** Math.min(state.consecutiveFailures - 1, 4),
  );
}

export function shouldThrottleLiveDiscoveryFetch(opts?: { force?: boolean }): boolean {
  if (opts?.force) return false;
  return Date.now() - state.lastAttemptMs < backoffMs();
}

export function markLiveDiscoveryFetchAttempt(): void {
  state.lastAttemptMs = Date.now();
}

export function markLiveDiscoveryFetchResult(ok: boolean, error?: string | null): void {
  if (ok) {
    state.consecutiveFailures = 0;
    state.lastError = null;
  } else {
    state.consecutiveFailures += 1;
    if (error) state.lastError = error;
  }
}

export function getLiveDiscoveryLastError(): string | null {
  return state.lastError;
}

/** @internal test helper */
export function resetLiveDiscoveryFetchPolicyForTests(): void {
  state.lastAttemptMs = 0;
  state.consecutiveFailures = 0;
  state.lastError = null;
}
