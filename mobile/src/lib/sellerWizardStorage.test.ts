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
  clearSellerWizardComplete,
  markSellerHqActivatedLocal,
  markSellerWizardCompleteLocal,
  readSellerHqActivated,
  readSellerWizardComplete,
  SELLER_HQ_ACTIVATED_KEY,
  SELLER_WIZARD_COMPLETE_KEY,
  sellerHqActivatedKey,
  sellerWizardCompleteKey,
} from './sellerWizardStorage';

describe('sellerWizardStorage (per-user key scoping)', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('a brand new user (never set) reads not-complete, even with no prior data at all', async () => {
    expect(await readSellerWizardComplete('user-b')).toBe(false);
    expect(await readSellerHqActivated('user-b')).toBe(false);
  });

  it('returns false for an undefined user id without touching storage', async () => {
    expect(await readSellerWizardComplete(undefined)).toBe(false);
    expect(await readSellerHqActivated(undefined)).toBe(false);
  });

  it('marking complete for one user does not leak to a different user id', async () => {
    await markSellerWizardCompleteLocal('user-a');
    await markSellerHqActivatedLocal('user-a');

    expect(await readSellerWizardComplete('user-a')).toBe(true);
    expect(await readSellerHqActivated('user-a')).toBe(true);

    // A DIFFERENT user signing in on the same device must NOT inherit user-a's flags.
    expect(await readSellerWizardComplete('user-b')).toBe(false);
    expect(await readSellerHqActivated('user-b')).toBe(false);
  });

  it('stores flags under a per-user key, not the legacy device-wide key', async () => {
    await markSellerWizardCompleteLocal('user-a');
    await markSellerHqActivatedLocal('user-a');

    expect(memory.get(sellerWizardCompleteKey('user-a'))).toBe('1');
    expect(memory.get(sellerHqActivatedKey('user-a'))).toBe('1');
    expect(memory.has(SELLER_WIZARD_COMPLETE_KEY)).toBe(false);
    expect(memory.has(SELLER_HQ_ACTIVATED_KEY)).toBe(false);
  });

  it('clearSellerWizardComplete only clears the given user, leaving others untouched', async () => {
    await markSellerWizardCompleteLocal('user-a');
    await markSellerWizardCompleteLocal('user-b');

    await clearSellerWizardComplete('user-a');

    expect(await readSellerWizardComplete('user-a')).toBe(false);
    expect(await readSellerWizardComplete('user-b')).toBe(true);
  });

  it('migrates a legacy device-wide flag onto the currently signed-in user', async () => {
    memory.set(SELLER_WIZARD_COMPLETE_KEY, '1');

    expect(await readSellerWizardComplete('user-a')).toBe(true);
    expect(memory.get(sellerWizardCompleteKey('user-a'))).toBe('1');
  });

  it('does not migrate the legacy hq-activated flag onto a user who already has an explicit scoped value', async () => {
    memory.set(SELLER_HQ_ACTIVATED_KEY, '1');
    memory.set(sellerHqActivatedKey('user-a'), '0');

    expect(await readSellerHqActivated('user-a')).toBe(false);
  });

  describe('bounded, non-destructive legacy migration (shared-device multi-user scenario)', () => {
    it('never deletes the legacy key after migrating it, so a second (real) user on a shared device can still receive it', async () => {
      memory.set(SELLER_WIZARD_COMPLETE_KEY, '1');

      // User B signs in FIRST after the update (e.g. borrowed the device) and, per the inherent
      // ambiguity of a device-wide flag, adopts the legacy value.
      expect(await readSellerWizardComplete('user-b')).toBe(true);
      // Unlike the original implementation, the legacy key is NOT deleted...
      expect(memory.has(SELLER_WIZARD_COMPLETE_KEY)).toBe(true);

      // ...so when User A (the real owner who actually completed setup pre-update) signs in
      // afterwards, they are NOT permanently locked out of the value that was rightfully theirs.
      expect(await readSellerWizardComplete('user-a')).toBe(true);
      expect(memory.get(sellerWizardCompleteKey('user-a'))).toBe('1');
    });

    it('stops granting the legacy value once the distinct-user migration cap is reached', async () => {
      memory.set(SELLER_HQ_ACTIVATED_KEY, '1');

      expect(await readSellerHqActivated('user-1')).toBe(true);
      expect(await readSellerHqActivated('user-2')).toBe(true);
      expect(await readSellerHqActivated('user-3')).toBe(true);
      // A 4th distinct user beyond the cap must NOT retroactively receive the legacy flag.
      expect(await readSellerHqActivated('user-4')).toBe(false);
      expect(memory.has(sellerHqActivatedKey('user-4'))).toBe(false);

      // Legacy key is still intact (never deleted) even after the cap is reached.
      expect(memory.has(SELLER_HQ_ACTIVATED_KEY)).toBe(true);
    });

    it('a user who already migrated the legacy value keeps reading it as true on subsequent reads', async () => {
      memory.set(SELLER_WIZARD_COMPLETE_KEY, '1');

      expect(await readSellerWizardComplete('user-a')).toBe(true);
      expect(await readSellerWizardComplete('user-a')).toBe(true);
    });

    it('an explicit scoped value always takes priority over the legacy fallback, even after that user was previously migrated', async () => {
      memory.set(SELLER_WIZARD_COMPLETE_KEY, '1');
      await readSellerWizardComplete('user-a');

      await clearSellerWizardComplete('user-a');

      // Server later confirms user-a truly has NOT completed setup: the explicit clear must stick
      // even though the (still-present) legacy key would otherwise say "complete".
      expect(await readSellerWizardComplete('user-a')).toBe(false);
    });
  });
});
