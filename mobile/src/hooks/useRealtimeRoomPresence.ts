import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { countRoomPresenceViewers } from '../lib/liveRoomPresenceCount';
import { buildPresenceChannelKey } from '../lib/liveRoomPresenceKey';
import { isLiveStagePipKeepAliveActive } from '../lib/liveStagePipKeepAlive';
import {
  parseViewerCountBroadcast,
  shouldPublishViewerCountBroadcast,
} from '../lib/liveRoomViewerCountBroadcast';
import {
  createViewerCountStabilizerState,
  nextStabilizedViewerCount,
  resolveDisplayedViewerCount,
  VIEWER_COUNT_DECREASE_HOLD_MS,
} from '../lib/liveRoomViewerCountStabilize';
import { RT_EVENT } from '../lib/realtimeChannels';
import {
  bindLiveRoomPresenceHandlers,
  bindLiveRoomViewerCountHandler,
  releaseLiveRoomChannel,
  retainLiveRoomChannel,
  subscribeLiveRoomChannel,
} from '../lib/liveRoomSharedChannel';
import { ensureSupabaseReady, getSupabase } from '../lib/supabase';

const PRESENCE_HEARTBEAT_MS = 45_000;
/** Keep host broadcast fresh for buyers even when the count is unchanged. */
const HOST_UNCHANGED_PUBLISH_MS = 5_000;

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
  const [broadcastAtMs, setBroadcastAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  const userIdRef = useRef(userId);
  viewerDisplayNameRef.current = viewerDisplayName;
  userIdRef.current = userId;

  const presenceKeyRef = useRef<string>('');
  const lastBroadcastRef = useRef<{ count: number | null; at: number }>({ count: null, at: 0 });
  const stabilizerRef = useRef(createViewerCountStabilizerState());

  // Freeze the presence slot for a room session. Do NOT rebuild when auth hydrates
  // null → userId — that remounted presence and made the count jump.
  useLayoutEffect(() => {
    if (!liveRoomId || !enabled) {
      presenceKeyRef.current = '';
      return;
    }
    if (trackSelf) {
      const prefix = `${liveRoomId}:`;
      if (presenceKeyRef.current.startsWith(prefix)) return;
      presenceKeyRef.current = buildPresenceChannelKey(liveRoomId, userIdRef.current ?? null, true);
      return;
    }
    presenceKeyRef.current = buildPresenceChannelKey(liveRoomId, null, false);
  }, [enabled, liveRoomId, trackSelf]);

  useEffect(() => {
    if (!enabled || !liveRoomId) {
      setLocalCount(null);
      setBroadcastCount(null);
      setBroadcastAtMs(null);
      stabilizerRef.current = createViewerCountStabilizerState();
      return undefined;
    }

    const presenceKey = presenceKeyRef.current;
    if (!presenceKey) return undefined;

    let cancelled = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let hostPublishId: ReturnType<typeof setInterval> | null = null;
    let decreaseFlushId: ReturnType<typeof setTimeout> | null = null;
    let broadcastFreshId: ReturnType<typeof setInterval> | null = null;
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
            unchangedIntervalMs: HOST_UNCHANGED_PUBLISH_MS,
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
        const raw = countRoomPresenceViewers(channel.presenceState());
        const now = Date.now();
        const next = nextStabilizedViewerCount(stabilizerRef.current, raw, now);
        stabilizerRef.current = next;
        if (next.displayed != null) {
          setLocalCount(next.displayed);
          publishHostCount(next.displayed);
        }
        if (decreaseFlushId != null) {
          clearTimeout(decreaseFlushId);
          decreaseFlushId = null;
        }
        if (next.pendingDecrease != null && next.pendingSinceMs != null) {
          const wait = VIEWER_COUNT_DECREASE_HOLD_MS - (now - next.pendingSinceMs) + 50;
          decreaseFlushId = setTimeout(() => {
            updateCount();
          }, Math.max(50, wait));
        }
      };

      const trackPresence = async () => {
        if (!channel || !trackSelf) return;
        const uid = userIdRef.current;
        const username =
          typeof viewerDisplayNameRef.current === 'string' && viewerDisplayNameRef.current.trim().length > 0
            ? viewerDisplayNameRef.current.trim()
            : uid
              ? 'Member'
              : 'Guest';
        await channel.track({
          tabKey: presenceKey,
          userId: uid,
          username,
          liveRoomId,
          at: new Date().toISOString(),
        });
        updateCount();
      };

      // A buyer who backgrounds/closes the app while still on the live room screen previously
      // stayed counted until the presence heartbeat/connection eventually timed out server-side —
      // the room's own JS (including this 45s heartbeat) is itself paused while backgrounded, so
      // that could linger a while. Untracking immediately on background keeps the viewer count to
      // people actually watching. Skipped while Stage remote PiP is genuinely keeping the room open
      // (`isLiveStagePipKeepAliveActive`) — that buyer is still actively watching in the mini window.
      const untrackPresence = async () => {
        if (!channel || !trackSelf) return;
        if (isLiveStagePipKeepAliveActive()) return;
        await channel.untrack();
      };

      unbindPresence = bindLiveRoomPresenceHandlers(liveRoomId, {
        onSync: updateCount,
        onJoin: updateCount,
        onLeave: updateCount,
      });
      unbindViewerCount = bindLiveRoomViewerCountHandler(liveRoomId, (payload) => {
        const n = parseViewerCountBroadcast(payload);
        if (n == null) return;
        setBroadcastCount(n);
        setBroadcastAtMs(Date.now());
      });

      if (trackSelf) {
        broadcastFreshId = setInterval(() => setTick((t) => t + 1), 2_000);
        appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
          if (next === 'active') void trackPresence();
          else if (next === 'background') void untrackPresence();
        });
      }

      unsubscribeStatus = subscribeLiveRoomChannel(liveRoomId, async (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (trackSelf) {
          await trackPresence();
          if (heartbeatId != null) clearInterval(heartbeatId);
          heartbeatId = setInterval(() => void trackPresence(), PRESENCE_HEARTBEAT_MS);
        } else {
          updateCount();
          if (hostPublishId != null) clearInterval(hostPublishId);
          hostPublishId = setInterval(() => {
            const displayed = stabilizerRef.current.displayed;
            if (displayed != null) publishHostCount(displayed);
          }, HOST_UNCHANGED_PUBLISH_MS);
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
      if (hostPublishId != null) clearInterval(hostPublishId);
      if (decreaseFlushId != null) clearTimeout(decreaseFlushId);
      if (broadcastFreshId != null) clearInterval(broadcastFreshId);
      unsubscribeStatus?.();
      unbindPresence?.();
      unbindViewerCount?.();
      if (channel && supabase) {
        if (trackSelf) void channel.untrack();
        releaseLiveRoomChannel(supabase, liveRoomId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveRoomId, trackSelf]);

  if (!trackSelf) return localCount;

  return resolveDisplayedViewerCount({
    broadcastCount,
    broadcastAtMs,
    localCount,
    nowMs: Date.now(),
  });
}
