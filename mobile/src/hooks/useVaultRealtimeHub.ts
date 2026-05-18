import { useEffect } from 'react';
import { subscribeVaultRealtime, startVaultRealtimeHub, stopVaultRealtimeHub } from '../realtime/vaultRealtimeHub';
import type { VaultRealtimeChannel } from '../realtime/realtimeHooksPlan';

/** Subscribe to vault realtime events (orders, trades, etc.) for live UI refresh. */
export function useVaultRealtimeHub(
  userId: string | undefined,
  onEvent?: (channel: VaultRealtimeChannel, payload: unknown) => void,
) {
  useEffect(() => {
    if (!userId) return;
    startVaultRealtimeHub(userId);
    const unsub = onEvent ? subscribeVaultRealtime(onEvent) : undefined;
    return () => {
      unsub?.();
      stopVaultRealtimeHub();
    };
  }, [userId, onEvent]);
}
