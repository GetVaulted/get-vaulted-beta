import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-application', () => ({ nativeBuildVersion: '251' }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { isGooglePayNativeConfigured, nativeGooglePayConfigured } from './nativeGooglePay';

describe('Google Pay native gate (OTA-safe)', () => {
  it('only allows Google Pay on Android binaries that ship it (1.1.0 / 252+)', () => {
    expect(isGooglePayNativeConfigured('android', '252')).toBe(true);
    expect(isGooglePayNativeConfigured('android', '260')).toBe(true);
    expect(isGooglePayNativeConfigured('android', '251')).toBe(false);
    expect(isGooglePayNativeConfigured('android', null)).toBe(false);
    expect(isGooglePayNativeConfigured('ios', '252')).toBe(false);
  });

  it('reads the installed build — 1.0.13 (251) gets no Google Pay', () => {
    expect(nativeGooglePayConfigured()).toBe(false);
  });
});
