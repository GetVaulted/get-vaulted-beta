import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { summarizeRoomPresence } from '../lib/liveRoomPresenceCount';
import {
  hostCountFreshMs,
  hostCountPublishPlan,
  newSessionDraw,
  planPresence,
  resolveRoomSizeHint,
  smoothWeightedCount,
  weightDriftExceeds,
} from '../lib/liveRoomScale';
import { buildPresenceChannelKey, warmPresenceSlot } from '../lib/liveRoomPresenceKey';
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
export type RoomPresenceStats = {
  /** Displayed viewer count (same number `useRealtimeRoomPresence` returns). */
  count: number | null;
  /** Best guess of room size (fresh host broadcast, else the `roomSizeHint` option). */
  roomSizeHint: number;
  /** A host console is broadcasting the count right now — viewers need not report it to the API. */
  hostBroadcastFresh: boolean;
  /** This viewer's stable random draw, used for all sampling decisions. */
  draw: number;
};

export type RoomPresenceOptions = {
  liveRoomId: string | null;
  enabled?: boolean;
  userId?: string | null;
  viewerDisplayName?: string | null;
  trackSelf?: boolean;
  /**
   * Last known room size (e.g. `viewerCount` from the room snapshot). Big rooms switch to sampled presence
   * so a 1,000-viewer show does not make every viewer announce itself to every other viewer.
   */
  roomSizeHint?: number | null;
};

export function useRealtimeRoomPresence(opts: RoomPresenceOptions): number | null {
  return useRealtimeRoomPresenceStats(opts).count;
}

export function useRealtimeRoomPresenceStats(opts: RoomPresenceOptions): RoomPresenceStats {
  const {
    liveRoomId,
    enabled = true,
    userId = null,
    viewerDisplayName = null,
    trackSelf = true,
    roomSizeHint = null,
  } = opts;
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null);
  const [broadcastAtMs, setBroadcastAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  const userIdRef = useRef(userId);
  viewerDisplayNameRef.current = viewerDisplayName;
  userIdRef.current = userId;
  const roomSizeHintRef = useRef<number | null>(roomSizeHint);
  useEffect(() => {
    roomSizeHintRef.current = roomSizeHint;
  }, [roomSizeHint]);
  /** One stable random number per viewer session — every sampling decision uses it. */
  const [draw] = useState(() => newSessionDraw());
  const broadcastRef = useRef<{ count: number | null; at: number | null }>({ count: null, at: null });
  const smoothedRef = useRef<number | null>(null);

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
      broadcastRef.current = { count: null, at: null };
      smoothedRef.current = null;
      stabilizerRef.current = createViewerCountStabilizerState();
      return undefined;
    }

    // `let`, not `const` — trackSelf sessions may correct this once the persisted presence
    // identity loads (see the warmPresenceSlot call below). `wire()` closes over this variable
    // by reference, so reassigning it before `wire()` runs is picked up correctly.
    let presenceKey = presenceKeyRef.current;
    if (!presenceKey) return undefined;

    let cancelled = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let hostPublishId: ReturnType<typeof setInterval> | null = null;
    let decreaseFlushId: ReturnType<typeof setTimeout> | null = null;
    let broadcastFreshId: ReturnType<typeof setInterval> | null = null;
    let settleId: ReturnType<typeof setTimeout> | null = null;
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
        const publishPlan = hostCountPublishPlan(count);
        if (
          !shouldPublishViewerCountBroadcast({
            nextCount: count,
            lastCount: prev.count,
            lastPublishedAtMs: prev.at,
            nowMs: now,
            unchangedIntervalMs: publishPlan.unchangedMs,
            changedIntervalMs: publishPlan.changedMs,
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

      const currentHint = () => {
        const b = broadcastRef.current;
        return resolveRoomSizeHint({
          broadcastCount: b.count,
          broadcastFresh: b.at != null && Date.now() - b.at <= hostCountFreshMs(b.count),
          snapshotHint: roomSizeHintRef.current,
        });
      };

      const updateCount = () => {
        if (!channel) return;
        const summary = summarizeRoomPresence(channel.presenceState());
        // Sampled (weighted) counts are estimates — smooth them so the number does not twitch, and so the
        // "increases apply immediately" stabilizer cannot ratchet up on noise.
        const raw = summary.weighted ? smoothWeightedCount(smoothedRef.current, summary.count) : summary.count;
        smoothedRef.current = summary.weighted ? raw : null;
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

      /** What we last announced for this connection (null until tracked). */
      let announced: { weight: number; quiet: boolean } | null = null;

      /**
       * Decide whether this viewer should be in the presence list and announce / withdraw accordingly.
       * Normal rooms: everyone tracks and `force` re-sends on the 45s heartbeat (unchanged behaviour).
       * Big rooms: only a sample tracks (each carries a weight) and nothing is re-sent on a heartbeat —
       * presence changes are broadcast to the whole room, so every avoided re-send is multiplied by the crowd.
       */
      const trackPresence = async (force = true) => {
        if (!channel || !trackSelf) return;
        const plan = planPresence(draw, currentHint(), announced?.quiet ?? false);
        if (!plan.track) {
          if (announced) {
            announced = null;
            await channel.untrack();
            updateCount();
          }
          return;
        }
        const changed =
          announced == null ||
          announced.quiet !== plan.quiet ||
          weightDriftExceeds(announced.weight, plan.weight);
        if (!changed && !(force && !plan.quiet)) return;
        const uid = userIdRef.current;
        const username =
          typeof viewerDisplayNameRef.current === 'string' && viewerDisplayNameRef.current.trim().length > 0
            ? viewerDisplayNameRef.current.trim()
            : uid
              ? 'Member'
              : 'Guest';
        announced = { weight: plan.weight, quiet: plan.quiet };
        await channel.track({
          tabKey: presenceKey,
          userId: uid,
          username,
          liveRoomId,
          at: new Date().toISOString(),
          w: plan.weight,
          nohb: plan.quiet,
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
        announced = null;
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
        const at = Date.now();
        broadcastRef.current = { count: n, at };
        setBroadcastCount(n);
        setBroadcastAtMs(at);
      });

      if (trackSelf) {
        broadcastFreshId = setInterval(() => setTick((t) => t + 1), 2_000);
        appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
          if (next === 'active') void trackPresence(true);
          else if (next === 'background') void untrackPresence();
        });
      }

      unsubscribeStatus = subscribeLiveRoomChannel(liveRoomId, async (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (trackSelf) {
          // A new socket has no presence on the server yet — forget what we announced on the old one.
          announced = null;
          await trackPresence(true);
          if (heartbeatId != null) clearInterval(heartbeatId);
          heartbeatId = setInterval(() => void trackPresence(true), PRESENCE_HEARTBEAT_MS);
          // Re-check the plan soon after joining: the room-size hint is often stale (or 0) at join time,
          // and the first host broadcast arrives within a few seconds.
          if (settleId != null) clearTimeout(settleId);
          settleId = setTimeout(() => void trackPresence(false), 8_000 + Math.round(Math.random() * 4_000));
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
      // Belt-and-suspenders alongside the AuthContext bootstrap warm-up: covers a cold start that
      // deep-links straight into a live room (e.g. tapping a "time to go live" push or a shared
      // live link) before AuthContext's own warm-up has necessarily resolved. Correct the
      // presence key here, before the channel is ever retained/tracked, so the identity used for
      // the whole session is the real persisted one rather than a throwaway cold-start random ID.
      if (trackSelf) {
        await warmPresenceSlot(userIdRef.current ?? null);
        if (cancelled) return;
        const corrected = buildPresenceChannelKey(liveRoomId, userIdRef.current ?? null, true);
        presenceKey = corrected;
        presenceKeyRef.current = corrected;
      }
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
      if (settleId != null) clearTimeout(settleId);
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

  const nowMs = Date.now();
  const hostBroadcastFresh =
    broadcastAtMs != null && nowMs - broadcastAtMs <= hostCountFreshMs(broadcastCount);
  const roomSizeHintNow = resolveRoomSizeHint({
    broadcastCount,
    broadcastFresh: hostBroadcastFresh,
    snapshotHint: roomSizeHint,
  });

  if (!trackSelf) return { count: localCount, roomSizeHint: roomSizeHintNow, hostBroadcastFresh, draw };

  return {
    count: resolveDisplayedViewerCount({
      broadcastCount,
      broadcastAtMs,
      localCount,
      nowMs,
      broadcastFreshMs: hostCountFreshMs(broadcastCount),
    }),
    roomSizeHint: roomSizeHintNow,
    hostBroadcastFresh,
    draw,
  };
}
