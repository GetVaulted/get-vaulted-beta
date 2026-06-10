import { useEffect } from 'react';
import { subscribeVaultRealtime } from '../realtime/vaultRealtimeHub';
import type { VaultRealtimeChannel } from '../realtime/realtimeHooksPlan';

/** Subscribe to vault realtime events. Hub lifecycle is managed by PushRegistrationEffect. */
export function useVaultRealtimeHub(
  userId: string | undefined,
  onEvent?: (channel: VaultRealtimeChannel, payload: unknown) => void,
) {
  useEffect(() => {
    if (!userId || !onEvent) return;
    return subscribeVaultRealtime(onEvent);
  }, [userId, onEvent]);
}
