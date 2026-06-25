import { afterEach, describe, expect, it, vi } from 'vitest';
import { areDevToolsEnabled } from './devTools';

describe('areDevToolsEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when EXPO_PUBLIC_ENABLE_DEV_TOOLS is unset (production default)', () => {
    vi.stubEnv('EXPO_PUBLIC_ENABLE_DEV_TOOLS', '');
    expect(areDevToolsEnabled()).toBe(false);
  });

  it('is disabled for arbitrary values', () => {
    vi.stubEnv('EXPO_PUBLIC_ENABLE_DEV_TOOLS', 'yes');
    expect(areDevToolsEnabled()).toBe(false);
  });

  it('is enabled only for 1 or true', () => {
    vi.stubEnv('EXPO_PUBLIC_ENABLE_DEV_TOOLS', '1');
    expect(areDevToolsEnabled()).toBe(true);
    vi.stubEnv('EXPO_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    expect(areDevToolsEnabled()).toBe(true);
  });
});
