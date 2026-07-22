import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { countRoomPresenceViewers } from '../lib/liveRoomPresenceCount';
import { buildPresenceChannelKey } from '../lib/liveRoomPresenceKey';
import {
  parseViewerCountBroadcast,
  shouldPublishViewerCountBroadcast,
} from '../lib/liveRoomViewerCountBroadcast';
import { RT_EVENT } from '../lib/realtimeChannels';
import {
  bindLiveRoomPresenceHandlers,
  bindLiveRoomViewerCountHandler,
  releaseLiveRoomChannel,
  retainLiveRoomChannel,
  subscribeLiveRoomChannel,
} from '../lib/liveRoomSharedChannel';
import { ensureSupabaseReady, getSupabase } from '../lib/supabase';

/**
 * Supabase Realtime presence for live rooms — same channel as web (`gv-room-{id}`).
 * Buyers track themselves; host consoles pass `trackSelf: false` to observe only and
 * broadcast the room-wide viewer count so every client shows the same number.
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
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  viewerDisplayNameRef.current = viewerDisplayName;

  const presenceKeyRef = useRef<string>('');
  const lastBroadcastRef = useRef<{ count: number | null; at: number }>({ count: null, at: 0 });

  useLayoutEffect(() => {
    presenceKeyRef.current =
      liveRoomId && enabled
        ? buildPresenceChannelKey(liveRoomId, userId ?? null, trackSelf)
        : '';
  }, [enabled, liveRoomId, trackSelf, userId]);

  useEffect(() => {
    if (!enabled || !liveRoomId) {
      setLocalCount(null);
      setBroadcastCount(null);
      return undefined;
    }

    const presenceKey = presenceKeyRef.current;
    if (!presenceKey) return undefined;

    let cancelled = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;
    let channel: ReturnType<typeof retainLiveRoomChannel> | null = null;
    let supabase = getSupabase();
    let unsubscribeStatus: (() => void) | null = null;
    let unbindPresence: (() => void) | null = null;
    let unbindViewerCount: (() => void) | null = null;

    const wire = () => {
      if (cancelled || !supabase) return;
      channel = retainLiveRoomChannel(supabase, liveRoomId, presenceKey);

      const publishHostCount = (count: number) => {
        if (trackSelf || !channel) return;
        const now = Date.now();
        const prev = lastBroadcastRef.current;
        if (
          !shouldPublishViewerCountBroadcast({
            nextCount: count,
            lastCount: prev.count,
            lastPublishedAtMs: prev.at,
            nowMs: now,
          })
        ) {
          return;
        }
        lastBroadcastRef.current = { count, at: now };
        void channel.send({
          type: 'broadcast',
          event: RT_EVENT.viewerCount,
          payload: { liveRoomId, viewerCount: count, at: now },
        });
      };

      const updateCount = () => {
        if (!channel) return;
        const next = countRoomPresenceViewers(channel.presenceState());
        setLocalCount(next);
        publishHostCount(next);
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
          tabKey: presenceKey,
          userId,
          username,
          liveRoomId,
          at: new Date().toISOString(),
        });
        updateCount();
      };

      unbindPresence = bindLiveRoomPresenceHandlers(liveRoomId, {
        onSync: updateCount,
        onJoin: updateCount,
        onLeave: updateCount,
      });
      unbindViewerCount = bindLiveRoomViewerCountHandler(liveRoomId, (payload) => {
        const n = parseViewerCountBroadcast(payload);
        if (n != null) setBroadcastCount(n);
      });

      if (trackSelf) {
        appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
          if (next === 'active') void trackPresence();
        });
      }

      unsubscribeStatus = subscribeLiveRoomChannel(liveRoomId, async (status) => {
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

    void (async () => {
      await ensureSupabaseReady();
      if (cancelled) return;
      supabase = getSupabase();
      wire();
    })();

    return () => {
      cancelled = true;
      if (appStateSub) appStateSub.remove();
      if (heartbeatId != null) clearInterval(heartbeatId);
      unsubscribeStatus?.();
      unbindPresence?.();
      unbindViewerCount?.();
      if (channel && supabase) {
        if (trackSelf) void channel.untrack();
        releaseLiveRoomChannel(supabase, liveRoomId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveRoomId, trackSelf, userId]);

  return broadcastCount ?? localCount;
}
