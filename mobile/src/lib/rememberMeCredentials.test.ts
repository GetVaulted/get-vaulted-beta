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
  loadRememberedCredentials,
  persistRememberMeCredentials,
} from './rememberMeCredentials';

describe('rememberMeCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage?.clear();
  });

  it('returns false when nothing is stored', async () => {
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedCredentials()).resolves.toBeNull();
  });

  it('saves and loads credentials on web storage', async () => {
    await persistRememberMeCredentials(true, 'User@Example.com', 'secret-pass');
    await expect(getRememberMePreference()).resolves.toBe(true);
    await expect(loadRememberedCredentials()).resolves.toEqual({
      email: 'user@example.com',
      password: 'secret-pass',
    });
  });

  it('clears stored credentials when remember me is disabled', async () => {
    await persistRememberMeCredentials(true, 'user@example.com', 'secret-pass');
    await persistRememberMeCredentials(false, 'user@example.com', 'secret-pass');
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedCredentials()).resolves.toBeNull();
  });

  it('clearRememberMeCredentials removes saved data', async () => {
    await persistRememberMeCredentials(true, 'user@example.com', 'secret-pass');
    await clearRememberMeCredentials();
    await expect(getRememberMePreference()).resolves.toBe(false);
    await expect(loadRememberedCredentials()).resolves.toBeNull();
  });

  it('writes native store file when not on web', async () => {
    const platform = await import('react-native');
    const originalOs = platform.Platform.OS;
    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: 'ios' });

    await persistRememberMeCredentials(true, 'user@example.com', 'native-pass');

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      '/cache/gv-remember-me-v1.json',
      expect.stringContaining('"email":"user@example.com"'),
    );

    Object.defineProperty(platform.Platform, 'OS', { configurable: true, value: originalOs });
  });
});
