import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (memory.has(key) ? memory.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  },
}));

import {
  clearBuyerPreferredShippingRateKey,
  getBuyerPreferredShippingRateKey,
  setBuyerPreferredShippingRateKey,
} from './buyerShippingPreference';

const LEGACY_KEY = 'gv_buyer_preferred_shipping_rate_key';

describe('buyerShippingPreference (per-user key scoping + legacy migration)', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('returns null for a brand new user with nothing stored', async () => {
    expect(await getBuyerPreferredShippingRateKey('user-a')).toBeNull();
  });

  it('returns null for an undefined user id without touching storage', async () => {
    expect(await getBuyerPreferredShippingRateKey(undefined)).toBeNull();
  });

  it('saves and reads a preference scoped to a specific user', async () => {
    await setBuyerPreferredShippingRateKey('user-a', 'ups:ground');
    expect(await getBuyerPreferredShippingRateKey('user-a')).toBe('ups:ground');
  });

  it('does not leak one user\'s saved preference to a different user id', async () => {
    await setBuyerPreferredShippingRateKey('user-a', 'ups:ground');
    expect(await getBuyerPreferredShippingRateKey('user-b')).toBeNull();
  });

  it('stores the preference under a per-user key, not the legacy device-wide key', async () => {
    await setBuyerPreferredShippingRateKey('user-a', 'ups:ground');
    expect(memory.has(LEGACY_KEY)).toBe(false);
  });

  it('migrates a legacy device-wide preference onto the reading user once, then clears the legacy key', async () => {
    memory.set(LEGACY_KEY, 'fedex:2day');

    expect(await getBuyerPreferredShippingRateKey('user-a')).toBe('fedex:2day');
    expect(memory.get(`${LEGACY_KEY}:user-a`)).toBe('fedex:2day');
    expect(memory.has(LEGACY_KEY)).toBe(false);
  });

  it('a subsequent different user does not see the already-migrated-and-cleared legacy value', async () => {
    memory.set(LEGACY_KEY, 'fedex:2day');

    await getBuyerPreferredShippingRateKey('user-a');
    expect(await getBuyerPreferredShippingRateKey('user-b')).toBeNull();
  });

  it('prefers an explicit scoped value over the legacy fallback', async () => {
    memory.set(LEGACY_KEY, 'fedex:2day');
    memory.set(`${LEGACY_KEY}:user-a`, 'usps:priority');

    expect(await getBuyerPreferredShippingRateKey('user-a')).toBe('usps:priority');
    // Legacy fallback path should not even be consulted (and thus not cleared) when the user
    // already has their own explicit value.
    expect(memory.has(LEGACY_KEY)).toBe(true);
  });

  it('clearBuyerPreferredShippingRateKey only clears the given user, leaving others untouched', async () => {
    await setBuyerPreferredShippingRateKey('user-a', 'ups:ground');
    await setBuyerPreferredShippingRateKey('user-b', 'fedex:2day');

    await clearBuyerPreferredShippingRateKey('user-a');

    expect(await getBuyerPreferredShippingRateKey('user-a')).toBeNull();
    expect(await getBuyerPreferredShippingRateKey('user-b')).toBe('fedex:2day');
  });
});
