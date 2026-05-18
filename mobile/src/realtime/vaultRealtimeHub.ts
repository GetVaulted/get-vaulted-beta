import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { emitNotificationBadgeChanged } from '../platform/notificationEvents';
import { pushNotification } from '../platform/notificationStore';
import type { VaultRealtimeChannel } from './realtimeHooksPlan';

type Listener = (channel: VaultRealtimeChannel, payload: unknown) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

export function subscribeVaultRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(channel: VaultRealtimeChannel, payload: unknown) {
  for (const l of listeners) l(channel, payload);
}

export function startVaultRealtimeHub(userId: string | undefined): void {
  stopVaultRealtimeHub();
  if (!userId) return;
  const sb = getSupabase();
  if (!sb) return;

  channel = sb
    .channel(`vault-ecosystem-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` },
      (payload) => {
        emit('order_state', payload);
        void onOrderChange(userId, payload);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trade_offers', filter: `recipient_id=eq.${userId}` },
      (payload) => {
        emit('trade_offer', payload);
        void onTradeChange(userId, 'offer', payload);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trade_offers', filter: `sender_id=eq.${userId}` },
      (payload) => {
        emit('trade_counter', payload);
        void onTradeChange(userId, 'counter', payload);
      },
    )
    .subscribe();
}

export function stopVaultRealtimeHub(): void {
  const sb = getSupabase();
  if (channel && sb) void sb.removeChannel(channel);
  channel = null;
}

async function onOrderChange(userId: string, payload: unknown) {
  const row = (payload as { new?: { status?: string; id?: string } })?.new;
  if (!row?.id) return;
  await pushNotification({
    userId,
    kind: 'order',
    title: 'Order update',
    body: `Your vault order is now ${row.status ?? 'updated'}.`,
    referenceType: 'order',
    referenceId: row.id,
  });
  emitNotificationBadgeChanged();
}

async function onTradeChange(userId: string, kind: 'offer' | 'counter', payload: unknown) {
  const row = (payload as { new?: { id?: string; status?: string } })?.new;
  await pushNotification({
    userId,
    kind: kind === 'offer' ? 'offer' : 'counter',
    title: kind === 'offer' ? 'New trade offer' : 'Trade updated',
    body: row?.status ? `Status: ${row.status}` : 'Check Trade Center',
    referenceType: 'trade',
    referenceId: row?.id,
  });
  emitNotificationBadgeChanged();
}
