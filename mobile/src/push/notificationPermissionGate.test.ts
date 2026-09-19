import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPermissionsAsync = vi.fn();
const isPushNotificationsAvailable = vi.fn();

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => getPermissionsAsync(...args),
}));

vi.mock('./pushRegistrationService', () => ({
  isPushNotificationsAvailable: (...args: unknown[]) => isPushNotificationsAvailable(...args),
}));

import { shouldPromptNotificationPermission } from './notificationPermissionGate';

describe('shouldPromptNotificationPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPushNotificationsAvailable.mockReturnValue(true);
  });

  it('skips when push is unavailable (Expo Go / simulator)', async () => {
    isPushNotificationsAvailable.mockReturnValue(false);
    await expect(shouldPromptNotificationPermission()).resolves.toBe(false);
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('skips when already granted', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await expect(shouldPromptNotificationPermission()).resolves.toBe(false);
  });

  it('prompts when undetermined', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    await expect(shouldPromptNotificationPermission()).resolves.toBe(true);
  });

  it('prompts when denied so login can re-ask / open settings', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await expect(shouldPromptNotificationPermission()).resolves.toBe(true);
  });
});
