import { useEffect } from 'react';
import {
  isLayawayEcosystemEvent,
  isListingEcosystemEvent,
  isOrderEcosystemEvent,
  type VaultEcosystemEvent,
} from '../lib/vaultEcosystemRealtime';
import { subscribeVaultRealtime } from '../realtime/vaultRealtimeHub';

export type VaultEcosystemEventHandler = (event: VaultEcosystemEvent) => void;

type Options = {
  enabled?: boolean;
  entityId?: string;
  onLayaway?: VaultEcosystemEventHandler;
  onOrder?: VaultEcosystemEventHandler;
  onListing?: VaultEcosystemEventHandler;
  onAny?: VaultEcosystemEventHandler;
};

function matchesEntity(event: VaultEcosystemEvent, entityId?: string): boolean {
  if (!entityId) return true;
  return event.entityId === entityId;
}

/** Subscribe to vault ecosystem broadcast events routed through vaultRealtimeHub. */
export function useVaultEcosystemEvents(userId: string | undefined, opts: Options = {}): void {
  const { enabled = true, entityId, onLayaway, onOrder, onListing, onAny } = opts;

  useEffect(() => {
    if (!enabled || !userId) return;

    return subscribeVaultRealtime((channel, payload) => {
      if (channel !== 'vault_ecosystem') return;
      const event = payload as VaultEcosystemEvent;
      if (!event?.type || !event.entityId) return;
      if (!matchesEntity(event, entityId)) return;

      onAny?.(event);
      if (isLayawayEcosystemEvent(event.type)) onLayaway?.(event);
      if (isOrderEcosystemEvent(event.type)) onOrder?.(event);
      if (isListingEcosystemEvent(event.type)) onListing?.(event);
    });
  }, [enabled, userId, entityId, onLayaway, onOrder, onListing, onAny]);
}
