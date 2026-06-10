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
import { emitNotificationBadgeChanged } from '../platform/notificationEvents';
import { pushNotification } from '../platform/notificationStore';
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

function routeVaultEcosystemEvent(userId: string, event: VaultEcosystemEvent): void {
  emitLocal('vault_ecosystem', event);

  if (isLayawayEcosystemEvent(event.type)) {
    emitLocal('layaway_seller', event);
    void onLayawayEcosystemEvent(userId, event);
  }
  if (event.type === 'order_created_from_layaway' || event.type === 'order_updated' || event.type === 'order_status_changed') {
    emitLocal('seller_order', event);
    void onOrderEcosystemEvent(userId, event);
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

async function onLayawayEcosystemEvent(userId: string, event: VaultEcosystemEvent) {
  if (event.sellerId !== userId && event.buyerId !== userId) return;
  const title = layawayPushTitle(event.type);
  const body = layawayPushBody(event);
  await pushNotification({
    userId,
    kind: 'layaway',
    title,
    body,
    referenceType: 'layaway',
    referenceId: event.entityId,
  });
  emitNotificationBadgeChanged();
}

async function onOrderEcosystemEvent(userId: string, event: VaultEcosystemEvent) {
  if (event.sellerId !== userId) return;
  const orderId = (event.payload?.orderId as string | undefined) ?? event.entityId;
  await pushNotification({
    userId,
    kind: 'order',
    title: 'Order ready to fulfill',
    body: 'A paid order is ready for shipping in Seller HQ.',
    referenceType: 'order',
    referenceId: orderId,
  });
  emitNotificationBadgeChanged();
}

function layawayPushTitle(type: VaultEcosystemEvent['type']): string {
  if (type === 'layaway_started' || type === 'listing_reserved_on_layaway') return 'Layaway started';
  if (type === 'layaway_payment_made') return 'Layaway payment received';
  if (type === 'layaway_paid_in_full' || type === 'order_created_from_layaway') return 'Layaway paid in full';
  if (type === 'layaway_defaulted') return 'Layaway defaulted';
  if (type === 'layaway_canceled') return 'Layaway canceled';
  return 'Layaway update';
}

function layawayPushBody(event: VaultEcosystemEvent): string {
  const remaining = event.payload?.remainingBalanceUsd;
  if (event.type === 'layaway_payment_made' && typeof remaining === 'number') {
    return `Payment applied. $${remaining.toFixed(2)} remains — do not ship yet.`;
  }
  if (event.type === 'layaway_paid_in_full' || event.type === 'order_created_from_layaway') {
    return 'Ready to ship — open Seller HQ fulfillment.';
  }
  if (event.type === 'layaway_started' || event.type === 'listing_reserved_on_layaway') {
    return 'Item reserved on layaway. Shipping unlocks when paid in full.';
  }
  if (event.type === 'layaway_defaulted') {
    return 'A layaway expired or defaulted. The listing is available again.';
  }
  return 'A buyer layaway was updated.';
}
