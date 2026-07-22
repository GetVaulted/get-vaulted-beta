import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { roomChannel, RT_EVENT } from './realtimeChannels';

type PresenceJoinPayload = { newPresences?: Record<string, unknown>[] };
type PresenceLeavePayload = { leftPresences?: Record<string, unknown>[] };

type ChannelEntry = {
  channel: RealtimeChannel;
  refs: number;
  subscribed: boolean;
  lastStatus: string | null;
  statusListeners: Set<(status: string) => void>;
  presenceSyncListeners: Set<() => void>;
  presenceJoinListeners: Set<(payload: PresenceJoinPayload) => void>;
  presenceLeaveListeners: Set<(payload: PresenceLeavePayload) => void>;
  viewerCountListeners: Set<(payload: unknown) => void>;
};

/** Ref-counted Supabase room channels — one topic per live room with presence enabled. */
const liveRoomChannels = new Map<string, ChannelEntry>();

function wireChannelMultiplexers(entry: ChannelEntry): void {
  entry.channel
    .on('presence', { event: 'sync' }, () => {
      for (const listener of entry.presenceSyncListeners) listener();
    })
    .on('presence', { event: 'join' }, (payload: PresenceJoinPayload) => {
      for (const listener of entry.presenceJoinListeners) listener(payload);
    })
    .on('presence', { event: 'leave' }, (payload: PresenceLeavePayload) => {
      for (const listener of entry.presenceLeaveListeners) listener(payload);
    })
    .on('broadcast', { event: RT_EVENT.viewerCount }, ({ payload }) => {
      for (const listener of entry.viewerCountListeners) listener(payload);
    });
}

/** Subscribe once per shared channel; multiplex status callbacks across hooks. */
export function subscribeLiveRoomChannel(
  liveRoomId: string,
  onStatus: (status: string) => void,
): () => void {
  const topic = roomChannel(liveRoomId);
  const entry = liveRoomChannels.get(topic);
  if (!entry) return () => {};

  entry.statusListeners.add(onStatus);
  if (entry.lastStatus) {
    onStatus(entry.lastStatus);
  }
  if (!entry.subscribed) {
    entry.subscribed = true;
    queueMicrotask(() => {
      const current = liveRoomChannels.get(topic);
      if (current !== entry) return;
      void entry.channel.subscribe((status) => {
        entry.lastStatus = status;
        for (const listener of entry.statusListeners) {
          listener(status);
        }
      });
    });
  }

  return () => {
    entry.statusListeners.delete(onStatus);
  };
}

export function bindLiveRoomPresenceHandlers(
  liveRoomId: string,
  handlers: {
    onSync: () => void;
    onJoin?: (payload: PresenceJoinPayload) => void;
    onLeave?: (payload: PresenceLeavePayload) => void;
  },
): () => void {
  const topic = roomChannel(liveRoomId);
  const entry = liveRoomChannels.get(topic);
  if (!entry) return () => {};

  entry.presenceSyncListeners.add(handlers.onSync);
  if (handlers.onJoin) entry.presenceJoinListeners.add(handlers.onJoin);
  if (handlers.onLeave) entry.presenceLeaveListeners.add(handlers.onLeave);

  return () => {
    entry.presenceSyncListeners.delete(handlers.onSync);
    if (handlers.onJoin) entry.presenceJoinListeners.delete(handlers.onJoin);
    if (handlers.onLeave) entry.presenceLeaveListeners.delete(handlers.onLeave);
  };
}

export function bindLiveRoomViewerCountHandler(
  liveRoomId: string,
  onPayload: (payload: unknown) => void,
): () => void {
  const topic = roomChannel(liveRoomId);
  const entry = liveRoomChannels.get(topic);
  if (!entry) return () => {};
  entry.viewerCountListeners.add(onPayload);
  return () => {
    entry.viewerCountListeners.delete(onPayload);
  };
}

export function peekLiveRoomChannel(liveRoomId: string): RealtimeChannel | null {
  return liveRoomChannels.get(roomChannel(liveRoomId))?.channel ?? null;
}

export function retainLiveRoomChannel(
  supabase: SupabaseClient,
  liveRoomId: string,
  presenceKey: string,
): RealtimeChannel {
  const topic = roomChannel(liveRoomId);
  const existing = liveRoomChannels.get(topic);
  if (existing) {
    existing.refs += 1;
    return existing.channel;
  }
  const channel = supabase.channel(topic, {
    config: { presence: { key: presenceKey } },
  });
  const entry: ChannelEntry = {
    channel,
    refs: 1,
    subscribed: false,
    lastStatus: null,
    statusListeners: new Set(),
    presenceSyncListeners: new Set(),
    presenceJoinListeners: new Set(),
    presenceLeaveListeners: new Set(),
    viewerCountListeners: new Set(),
  };
  wireChannelMultiplexers(entry);
  liveRoomChannels.set(topic, entry);
  return channel;
}

export function releaseLiveRoomChannel(supabase: SupabaseClient, liveRoomId: string): void {
  const topic = roomChannel(liveRoomId);
  const entry = liveRoomChannels.get(topic);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    liveRoomChannels.delete(topic);
    void supabase.removeChannel(entry.channel);
  }
}

export function resetLiveRoomSharedChannelsForTests(): void {
  liveRoomChannels.clear();
}
