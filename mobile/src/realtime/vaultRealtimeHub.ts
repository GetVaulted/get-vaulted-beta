import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import {
  isLayawayEcosystemEvent,
  parseVaultEcosystemEvent,
  vaultEcosystemChannel,
  VAULT_ECOSYSTEM_RT_EVENT,
  type VaultEcosystemEvent,
} from '../lib/vaultEcosystemRealtime';
import { notifyListingCatalogChanged } from '../lib/notifyListingCatalogChanged';
import type { VaultRealtimeChannel } from './realtimeHooksPlan';

type Listener = (channel: VaultRealtimeChannel, payload: unknown) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let activeUserId: string | null = null;

export function subscribeVaultRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitLocal(channelName: VaultRealtimeChannel, payload: unknown) {
  for (const l of listeners) l(channelName, payload);
}

export function startVaultRealtimeHub(userId: string | undefined): void {
  if (!userId || (channel && activeUserId === userId)) return;
  stopVaultRealtimeHub();
  const sb = getSupabase();
  if (!sb) return;

  activeUserId = userId;
  channel = sb
    .channel(vaultEcosystemChannel(userId))
    .on('broadcast', { event: VAULT_ECOSYSTEM_RT_EVENT }, ({ payload }) => {
      const event = parseVaultEcosystemEvent(payload);
      if (!event) return;
      routeVaultEcosystemEvent(userId, event);
    })
    .subscribe();
}

export function stopVaultRealtimeHub(): void {
  const sb = getSupabase();
  if (channel && sb) void sb.removeChannel(channel);
  channel = null;
  activeUserId = null;
}

/**
 * Route ecosystem events to local UI refresh channels only.
 *
 * Do not create local inbox/OS pushes here — the server already creates
 * role-correct notifications (buyer vs seller) via `createNotification`, and
 * `PushRegistrationEffect` syncs + Expo-pushes those. Local seller-copy pushes
 * were incorrectly shown to buyers on shared layaway/order events.
 */
function routeVaultEcosystemEvent(userId: string, event: VaultEcosystemEvent): void {
  void userId;
  emitLocal('vault_ecosystem', event);

  if (isLayawayEcosystemEvent(event.type)) {
    emitLocal('layaway_seller', event);
  }
  if (event.type === 'order_created_from_layaway' || event.type === 'order_updated' || event.type === 'order_status_changed') {
    emitLocal('seller_order', event);
  }
  if (event.type === 'listing_reserved_on_layaway' || event.type === 'listing_status_changed') {
    emitLocal('seller_inventory', event);
    void notifyListingCatalogChanged();
  }
  if (event.type === 'offer_updated') {
    emitLocal('trade_offer', event);
  }
  if (event.type === 'trade_offer_updated') {
    emitLocal('trade_counter', event);
  }
}
