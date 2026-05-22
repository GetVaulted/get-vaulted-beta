import { describe, expect, it, beforeEach } from 'vitest';
import {
  markLiveDiscoveryFetchAttempt,
  markLiveDiscoveryFetchResult,
  resetLiveDiscoveryFetchPolicyForTests,
  shouldThrottleLiveDiscoveryFetch,
} from './liveDiscoveryFetchPolicy';

describe('liveDiscoveryFetchPolicy', () => {
  beforeEach(() => {
    resetLiveDiscoveryFetchPolicyForTests();
  });

  it('allows first fetch', () => {
    expect(shouldThrottleLiveDiscoveryFetch()).toBe(false);
  });

  it('throttles rapid refetch after failure', () => {
    markLiveDiscoveryFetchAttempt();
    markLiveDiscoveryFetchResult(false, '403');
    expect(shouldThrottleLiveDiscoveryFetch()).toBe(true);
    expect(shouldThrottleLiveDiscoveryFetch({ force: true })).toBe(false);
  });
});
