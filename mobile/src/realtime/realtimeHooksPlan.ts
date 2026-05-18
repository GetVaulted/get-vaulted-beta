/**
 * Realtime ecosystem — event channels and consumer map.
 * Phase 1: Supabase Realtime subscriptions + local badge refresh.
 * Phase 2: push fan-out from server on each event type.
 */

export type VaultRealtimeChannel =
  | 'order_state'
  | 'trade_offer'
  | 'trade_counter'
  | 'support_message'
  | 'live_viewers'
  | 'live_auction'
  | 'seller_inventory'
  | 'follow'
  | 'review';

export type VaultRealtimeEvent<T = unknown> = {
  channel: VaultRealtimeChannel;
  userId?: string;
  referenceId?: string;
  payload: T;
  at: string;
};

export const REALTIME_WIRING: Record<
  VaultRealtimeChannel,
  { tables: string[]; consumers: string[] }
> = {
  order_state: { tables: ['orders'], consumers: ['buyer_orders', 'badges', 'push'] },
  trade_offer: { tables: ['trade_offers'], consumers: ['trade_center', 'badges', 'push'] },
  trade_counter: { tables: ['trade_offers'], consumers: ['trade_detail', 'badges', 'push'] },
  support_message: { tables: ['messages'], consumers: ['vault_comms', 'badges', 'push'] },
  live_viewers: { tables: ['live_shows_public'], consumers: ['live_discovery', 'host_console'] },
  live_auction: { tables: ['live_room_items'], consumers: ['live_room', 'push'] },
  seller_inventory: { tables: ['listings'], consumers: ['seller_hq', 'marketplace'] },
  follow: { tables: ['follows'], consumers: ['profiles', 'badges', 'push'] },
  review: { tables: ['reviews'], consumers: ['profiles', 'badges', 'push'] },
};
