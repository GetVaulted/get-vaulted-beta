import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { countRoomPresenceViewers } from '../lib/liveRoomPresenceCount';
import { roomChannel } from '../lib/realtimeChannels';
import { ensureSupabaseReady, getSupabase, isSupabaseConfigured } from '../lib/supabase';

async function stablePresenceKey(liveRoomId: string, userId: string | null): Promise<string> {
  const base = userId ? `u:${userId}` : 'guest';
  const storageKey = `gv-presence:${base}`;
  const existing = await AsyncStorage.getItem(storageKey);
  if (existing) return `${liveRoomId}:${existing}`;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(storageKey, created);
  return `${liveRoomId}:${created}`;
}

/**
 * Supabase Realtime presence for live rooms — same channel as web (`gv-room-{id}`).
 * Buyers track themselves; host consoles pass `trackSelf: false` to observe only.
 */
export function useRealtimeRoomPresence(opts: {
  liveRoomId: string | null;
  enabled?: boolean;
  userId?: string | null;
  viewerDisplayName?: string | null;
  trackSelf?: boolean;
}): number | null {
  const {
    liveRoomId,
    enabled = true,
    userId = null,
    viewerDisplayName = null,
    trackSelf = true,
  } = opts;
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  viewerDisplayNameRef.current = viewerDisplayName;

  useEffect(() => {
    if (!enabled || !liveRoomId || !isSupabaseConfigured()) return undefined;

    let cancelled = false;
    let channel: ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null = null;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;

    const setup = async () => {
      await ensureSupabaseReady();
      if (cancelled) return;
      const supabase = getSupabase();
      if (!supabase) return;

      const presenceSlot = trackSelf ? await stablePresenceKey(liveRoomId, userId ?? null) : '';
      channel = supabase.channel(
        roomChannel(liveRoomId),
        trackSelf ? { config: { presence: { key: presenceSlot } } } : undefined,
      );

      const updateCount = () => {
        if (!channel) return;
        const state = channel.presenceState();
        setViewerCount(countRoomPresenceViewers(state));
      };

      const trackPresence = async () => {
        if (!channel || !trackSelf) return;
        const username =
          typeof viewerDisplayNameRef.current === 'string' && viewerDisplayNameRef.current.trim().length > 0
            ? viewerDisplayNameRef.current.trim()
            : userId
              ? 'Member'
              : 'Guest';
        await channel.track({
          tabKey: presenceSlot,
          userId,
          username,
          liveRoomId,
          at: new Date().toISOString(),
        });
        updateCount();
      };

      channel
        .on('presence', { event: 'sync' }, updateCount)
        .on('presence', { event: 'join' }, updateCount)
        .on('presence', { event: 'leave' }, updateCount);

      if (trackSelf) {
        appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
          if (next === 'active') void trackPresence();
        });
      }

      void channel.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (trackSelf) {
          await trackPresence();
          if (heartbeatId != null) clearInterval(heartbeatId);
          heartbeatId = setInterval(() => void trackPresence(), 25_000);
        } else {
          updateCount();
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      if (appStateSub) appStateSub.remove();
      if (heartbeatId != null) clearInterval(heartbeatId);
      if (channel) {
        if (trackSelf) void channel.untrack();
        const supabase = getSupabase();
        if (supabase) void supabase.removeChannel(channel);
      }
    };
  }, [enabled, liveRoomId, trackSelf, userId]);

  return viewerCount;
}
