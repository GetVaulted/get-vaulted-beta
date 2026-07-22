import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { roomChannel } from "@/lib/realtime-channels";

type ChannelEntry = {
  channel: RealtimeChannel;
  refs: number;
  /** True once subscribe has been scheduled or completed for this entry. */
  subscribed: boolean;
  lastStatus: string | null;
  statusListeners: Set<(status: string) => void>;
};

/** Ref-counted Supabase room channels — one topic per live room with presence enabled. */
const liveRoomChannels = new Map<string, ChannelEntry>();

/**
 * Subscribe once per shared channel; multiplex status callbacks across hooks.
 *
 * Supabase forbids adding presence (and some other) callbacks after `subscribe()`.
 * Several hooks share one channel and register `.on(...)` in separate effects, so we
 * defer the actual `subscribe()` to a microtask — giving every same-tick retainer a
 * chance to attach handlers first (moderation → presence → room subscription).
 */
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

/** Returns the shared channel when already acquired (does not bump ref count). */
export function peekLiveRoomChannel(liveRoomId: string): RealtimeChannel | null {
  return liveRoomChannels.get(roomChannel(liveRoomId))?.channel ?? null;
}

/**
 * Supabase reuses an existing topic without applying new options. The first retainer must
 * pass a presence key so viewer counts work when broadcast + presence hooks share a room.
 */
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
  liveRoomChannels.set(topic, {
    channel,
    refs: 1,
    subscribed: false,
    lastStatus: null,
    statusListeners: new Set(),
  });
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

/** Clears ref-counted channels (tests / hard reset). */
export function resetLiveRoomSharedChannelsForTests(): void {
  liveRoomChannels.clear();
}
