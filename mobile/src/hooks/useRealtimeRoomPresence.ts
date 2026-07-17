import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { countRoomPresenceViewers } from '../lib/liveRoomPresenceCount';
import { buildPresenceChannelKey } from '../lib/liveRoomPresenceKey';
import { releaseLiveRoomChannel, retainLiveRoomChannel, subscribeLiveRoomChannel } from '../lib/liveRoomSharedChannel';
import { ensureSupabaseReady, getSupabase } from '../lib/supabase';

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

  const presenceKeyRef = useRef<string>('');

  useLayoutEffect(() => {
    presenceKeyRef.current =
      liveRoomId && enabled
        ? buildPresenceChannelKey(liveRoomId, userId ?? null, trackSelf)
        : '';
  }, [enabled, liveRoomId, trackSelf, userId]);

  useEffect(() => {
    if (!enabled || !liveRoomId) return undefined;

    const presenceKey = presenceKeyRef.current;
    if (!presenceKey) return undefined;

    let cancelled = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;
    let channel: ReturnType<typeof retainLiveRoomChannel> | null = null;
    // Don't gate on isSupabaseConfigured() up front — on a cold app start (store builds
    // especially) bootstrap from /api/mobile/supabase-config may not have resolved yet, and this
    // effect has no other trigger to re-run once it does. Always attempt ensureSupabaseReady()
    // below; it's a no-op once already configured.
    let supabase = getSupabase();
    let unsubscribeStatus: (() => void) | null = null;

    const wire = () => {
      if (cancelled || !supabase) return;
      channel = retainLiveRoomChannel(supabase, liveRoomId, presenceKey);

      const updateCount = () => {
        if (!channel) return;
        setViewerCount(countRoomPresenceViewers(channel.presenceState()));
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

      channel
        .on('presence', { event: 'sync' }, updateCount)
        .on('presence', { event: 'join' }, updateCount)
        .on('presence', { event: 'leave' }, updateCount);

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
      if (channel && supabase) {
        if (trackSelf) void channel.untrack();
        releaseLiveRoomChannel(supabase, liveRoomId);
      }
    };
    // `viewerDisplayName` is intentionally excluded: it's read live via a ref, and the 25s
    // heartbeat re-tracks it. Including it forced every viewer to untrack/re-track the moment
    // their profile name loaded (a few seconds after joining), flapping presence and making the
    // room read low when several distinct accounts joined at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveRoomId, trackSelf, userId]);

  return viewerCount;
}
