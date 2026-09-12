import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the "43 people in a near-empty room" viewer-count bug: presence
// identity must survive a cold JS engine restart (force-quit/relaunch, or an iOS memory
// eviction), not just persist for the lifetime of one running app instance.

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (storage.has(key) ? storage.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

describe('liveRoomPresenceKey', () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('warmPresenceSlot persists a freshly-minted slot so a later cold start reuses it', async () => {
    // "Run 1" — first ever launch, nothing in storage yet.
    const run1 = await import('./liveRoomPresenceKey');
    await run1.warmPresenceSlot('user-1');
    const key1 = run1.buildPresenceChannelKey('room-1', 'user-1', true);

    expect(storage.get('gv-presence:u:user-1')).toBeTruthy();

    // "Run 2" — simulates a cold JS engine restart: fresh module instance (fresh in-memory
    // Map), but the SAME underlying AsyncStorage-backed `storage`, exactly like a real
    // relaunch. Before the fix, resolvePresenceSlotSync would synchronously mint a brand-new
    // random ID here instead of reusing the persisted one.
    vi.resetModules();
    const run2 = await import('./liveRoomPresenceKey');
    await run2.warmPresenceSlot('user-1');
    const key2 = run2.buildPresenceChannelKey('room-1', 'user-1', true);

    expect(key2).toBe(key1);
  });

  it('resolvePresenceSlotSync returns the warmed value synchronously with no random mint', async () => {
    storage.set('gv-presence:u:user-2', 'persisted-slot-xyz');
    const mod = await import('./liveRoomPresenceKey');

    await mod.warmPresenceSlot('user-2');
    // Sync call, after warming — must not mint a new random ID.
    const slot = mod.resolvePresenceSlotSync('user-2');
    expect(slot).toBe('persisted-slot-xyz');
  });

  it('resolvePresenceSlotSync still falls back to a fresh id when nothing was warmed', async () => {
    const mod = await import('./liveRoomPresenceKey');
    // No warmPresenceSlot call — mirrors the pre-fix cold-start race for any caller that
    // skips the bootstrap warm-up (e.g. tests, or AsyncStorage genuinely unavailable).
    const slot = mod.resolvePresenceSlotSync('user-3');
    expect(typeof slot).toBe('string');
    expect(slot.length).toBeGreaterThan(0);
  });

  it('warmPresenceSlot only reads AsyncStorage once per base even if called repeatedly', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const mod = await import('./liveRoomPresenceKey');

    await mod.warmPresenceSlot('user-4');
    await mod.warmPresenceSlot('user-4');
    await mod.warmPresenceSlot('user-4');

    const calls = (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0] === 'gv-presence:u:user-4',
    );
    expect(calls.length).toBe(1);
  });

  it('warms a distinct, stable slot per userId and a separate guest slot', async () => {
    const mod = await import('./liveRoomPresenceKey');
    await mod.warmPresenceSlot('user-5');
    await mod.warmPresenceSlot('user-6');
    await mod.warmPresenceSlot(null);

    const keyA = mod.buildPresenceChannelKey('room-1', 'user-5', true);
    const keyB = mod.buildPresenceChannelKey('room-1', 'user-6', true);
    const keyGuest = mod.buildPresenceChannelKey('room-1', null, true);

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyGuest);
    expect(keyB).not.toBe(keyGuest);
    expect(storage.get('gv-presence:u:user-5')).toBeTruthy();
    expect(storage.get('gv-presence:u:user-6')).toBeTruthy();
    expect(storage.get('gv-presence:guest')).toBeTruthy();
  });
});
