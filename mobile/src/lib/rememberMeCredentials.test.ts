import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  documentDirectory: '/docs/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  clearRememberMeCredentials,
  getRememberMePreference,
  loadRememberedEmail,
  persistRememberMeCredentials,
} from './rememberMeCredentials';

/**
 * The module under test caches the loaded store in a module-level variable after the first
 * read, so the "stale v1 payload" regression test below needs a fresh module instance to
 * exercise the disk-read path rather than hitting a cache already populated by earlier tests.
 */
async function importFreshModule() {
  vi.resetModules();
  return import('./rememberMeCredentials');
}

describe('rememberMeCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage?.clear();
  });

  it('returns false/null when nothing is stored', async () => {
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedEmail()).resolves.toBeNull();
  });

  it('saves and loads only the email on web storage', async () => {
    await persistRememberMeCredentials(true, 'User@Example.com');
    await expect(getRememberMePreference()).resolves.toBe(true);
    await expect(loadRememberedEmail()).resolves.toBe('user@example.com');
  });

  it('clears stored data when remember me is disabled', async () => {
    await persistRememberMeCredentials(true, 'user@example.com');
    await persistRememberMeCredentials(false, 'user@example.com');
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedEmail()).resolves.toBeNull();
  });

  it('clearRememberMeCredentials removes saved data', async () => {
    await persistRememberMeCredentials(true, 'user@example.com');
    await clearRememberMeCredentials();
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedEmail()).resolves.toBeNull();
  });

  it('writes native store file when not on web, and never writes a password field', async () => {
    const platform = await import('react-native');
    const originalOs = platform.Platform.OS;
    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: 'ios' });

    await persistRememberMeCredentials(true, 'user@example.com');

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      '/cache/gv-remember-me-v1.json',
      expect.stringContaining('"email":"user@example.com"'),
    );
    const [, writtenPayload] = (FileSystem.writeAsStringAsync as unknown as { mock: { calls: [string, string][] } })
      .mock.calls[0];
    expect(writtenPayload).not.toContain('password');

    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: originalOs });
  });

  it('regression: a stale v1 payload containing a plaintext password is never surfaced', async () => {
    const platform = await import('react-native');
    const originalOs = platform.Platform.OS;
    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: 'ios' });

    (FileSystem.getInfoAsync as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ exists: true });
    (FileSystem.readAsStringAsync as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ v: 1, rememberMe: '1', email: 'legacy@example.com', password: 'old-plaintext-pass' }),
    );

    const fresh = await importFreshModule();
    await expect(fresh.loadRememberedEmail()).resolves.toBeNull();
    await expect(fresh.getRememberMePreference()).resolves.toBe(false);

    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: originalOs });
  });
});
