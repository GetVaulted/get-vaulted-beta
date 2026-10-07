"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { summarizeRoomPresence } from "@/lib/live-room-presence-count";
import {
  isBigRoom,
  newSessionDraw,
  planPresence,
  resolveRoomSizeHint,
  smoothWeightedCount,
  weightDriftExceeds,
} from "@/lib/live-room-scale";
import { buildPresenceChannelKey } from "@/lib/live-room-presence-key";
import {
  parseViewerCountBroadcast,
  shouldPublishViewerCountBroadcast,
} from "@/lib/live-room-viewer-count-broadcast";
import {
  createViewerCountStabilizerState,
  nextStabilizedViewerCount,
  resolveDisplayedViewerCount,
  VIEWER_COUNT_BROADCAST_FRESH_MS,
  VIEWER_COUNT_DECREASE_HOLD_MS,
} from "@/lib/live-room-viewer-count-stabilize";
import {
  bindLiveRoomPresenceHandlers,
  bindLiveRoomViewerCountHandler,
  releaseLiveRoomChannel,
  retainLiveRoomChannel,
  subscribeLiveRoomChannel,
} from "@/lib/live-room-shared-channel";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { RT_EVENT } from "@/lib/realtime-channels";

export type ViewerPresenceChatEvent = { kind: "joined"; label: string };

const PRESENCE_HEARTBEAT_MS = 45_000;
/** Keep host broadcast fresh for buyers even when the count is unchanged. */
const HOST_UNCHANGED_PUBLISH_MS = 5_000;

function resolvePresenceChatLabel(username: unknown, userId: unknown): string {
  if (typeof username === "string" && username.trim().length > 0) {
    const t = username.trim();
    return t.startsWith("@") ? t : `@${t}`;
  }
  if (typeof userId === "string" && userId.length > 0) return "Member";
  return "Guest";
}

/**
 * Stable id for "Joined" chat dedupe. Must not use `presence_ref` alone — Supabase / Phoenix assigns a
 * new ref on each `track()` heartbeat, which caused repeat join lines (especially Safari / iPad).
 */
function joinAnnounceId(p: Record<string, unknown>, liveRoomId: string): string {
  if (typeof p.tabKey === "string" && p.tabKey.length > 0) return `t:${p.tabKey}`;
  if (typeof p.userId === "string" && p.userId.length > 0) return `m:${liveRoomId}:${p.userId}`;
  if (typeof p.presence_ref === "string" && p.presence_ref.length > 0) return `r:${p.presence_ref}`;
  return "";
}

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

export function useRealtimeRoomPresence(opts: RoomPresenceOptions): number | null {
  return useRealtimeRoomPresenceStats(opts).count;
}

export type RoomPresenceOptions = {
  liveRoomId: string | null;
  enabled?: boolean;
  userId?: string | null;
  /** When false, observe presence only (host console — do not count yourself). Default true. */
  trackSelf?: boolean;
  /** Shown in chat when another viewer joins (leave events are not surfaced to chat). */
  viewerDisplayName?: string | null;
  onViewerEvent?: (event: ViewerPresenceChatEvent) => void;
  onPresenceStateChange?: (state: { status: string; reconnectCount: number }) => void;
  /**
   * Last known room size (e.g. `detail.viewerCount` from the room snapshot). Big rooms switch to sampled
   * presence so a 1,000-viewer show does not make every viewer announce itself to every other viewer.
   */
  roomSizeHint?: number | null;
};

export function useRealtimeRoomPresenceStats(opts: RoomPresenceOptions): RoomPresenceStats {
  const {
    liveRoomId,
    enabled = true,
    userId = null,
    trackSelf = true,
    viewerDisplayName = null,
    onViewerEvent,
    onPresenceStateChange,
    roomSizeHint = null,
  } = opts;
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null);
  const [broadcastAtMs, setBroadcastAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const onViewerEventRef = useRef(onViewerEvent);
  const onPresenceStateChangeRef = useRef(onPresenceStateChange);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  const userIdRef = useRef(userId);
  const roomSizeHintRef = useRef<number | null>(roomSizeHint);
  useEffect(() => {
    roomSizeHintRef.current = roomSizeHint;
  }, [roomSizeHint]);
  /** One stable random number per viewer session — every sampling decision uses it. */
  const [draw] = useState(() => newSessionDraw());
  const broadcastRef = useRef<{ count: number | null; at: number | null }>({ count: null, at: null });
  const smoothedRef = useRef<number | null>(null);
  onViewerEventRef.current = onViewerEvent;
  onPresenceStateChangeRef.current = onPresenceStateChange;
  viewerDisplayNameRef.current = viewerDisplayName;
  userIdRef.current = userId;

  const presenceKeyRef = useRef("");
  const lastBroadcastRef = useRef<{ count: number | null; at: number }>({ count: null, at: 0 });
  const stabilizerRef = useRef(createViewerCountStabilizerState());

  // Freeze the presence slot for a room session. Do NOT rebuild when session hydrates
  // null → userId — that remounted presence and made the count jump.
  useLayoutEffect(() => {
    if (!liveRoomId || !enabled) {
      presenceKeyRef.current = "";
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
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const presenceKey = presenceKeyRef.current;
    if (!presenceKey) return;

    const channel = retainLiveRoomChannel(supabase, liveRoomId, presenceKey);
    let reconnectCount = 0;
    let heartbeatId: number | null = null;
    let hostPublishId: number | null = null;
    let decreaseFlushId: number | null = null;
    let broadcastFreshId: number | null = null;
    let settleId: number | null = null;
    /** Cleared on matching presence `leave` so that viewer can get one join line again later. */
    const joinedChatAnnounced = new Set<string>();

    const publishHostCount = (count: number) => {
      if (trackSelf) return;
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
        type: "broadcast",
        event: RT_EVENT.viewerCount,
        payload: { liveRoomId, viewerCount: count, at: now },
      });
    };

    const currentHint = () => {
      const b = broadcastRef.current;
      return resolveRoomSizeHint({
        broadcastCount: b.count,
        broadcastFresh: b.at != null && Date.now() - b.at <= VIEWER_COUNT_BROADCAST_FRESH_MS,
        snapshotHint: roomSizeHintRef.current,
      });
    };

    const updateCount = () => {
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
        window.clearTimeout(decreaseFlushId);
        decreaseFlushId = null;
      }
      if (next.pendingDecrease != null && next.pendingSinceMs != null) {
        const wait = VIEWER_COUNT_DECREASE_HOLD_MS - (now - next.pendingSinceMs) + 50;
        decreaseFlushId = window.setTimeout(() => {
          updateCount();
        }, Math.max(50, wait));
      }
    };

    /** What we last announced for this connection (null until tracked). */
    let announced: { weight: number; quiet: boolean } | null = null;

    /**
     * Decide whether this viewer should be in the presence list and announce / withdraw accordingly.
     * Normal rooms: everyone tracks and `force` re-sends on the 45s heartbeat (unchanged behaviour).
     * Big rooms: only a sample tracks (each carries a weight), and nothing is re-sent on a heartbeat —
     * presence changes are broadcast to the whole room, so every avoided re-send is multiplied by the crowd.
     */
    const trackPresence = async (force = true) => {
      if (!trackSelf) return;
      const plan = planPresence(draw, currentHint());
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
      const username = resolvePresenceChatLabel(viewerDisplayNameRef.current, uid);
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

    // Bind via shared multiplexer — safe if moderation/subscription already retained the channel,
    // and safe when this effect re-runs after session hydrate (userId change).
    const unbindPresence = bindLiveRoomPresenceHandlers(liveRoomId, {
      onSync: updateCount,
      onJoin: (payload) => {
        // Big rooms: no per-viewer "joined" lines (hundreds of joins would flood chat) and only a sample
        // of viewers is tracked anyway.
        const announceJoins = !isBigRoom(currentHint());
        for (const p of announceJoins ? (payload?.newPresences ?? []) : []) {
          const id = joinAnnounceId(p, liveRoomId);
          if (!id || joinedChatAnnounced.has(id)) continue;
          joinedChatAnnounced.add(id);
          const label = resolvePresenceChatLabel(p.username, p.userId);
          onViewerEventRef.current?.({ kind: "joined", label });
        }
        updateCount();
      },
      onLeave: (payload) => {
        for (const p of payload?.leftPresences ?? []) {
          const id = joinAnnounceId(p, liveRoomId);
          if (id) joinedChatAnnounced.delete(id);
        }
        updateCount();
      },
    });

    const unbindViewerCount = bindLiveRoomViewerCountHandler(liveRoomId, (payload) => {
      const n = parseViewerCountBroadcast(payload);
      if (n == null) return;
      const at = Date.now();
      broadcastRef.current = { count: n, at };
      setBroadcastCount(n);
      setBroadcastAtMs(at);
    });

    // Re-evaluate broadcast freshness so buyers fall back to local after the window expires.
    if (trackSelf) {
      broadcastFreshId = window.setInterval(() => setTick((t) => t + 1), 2_000);
    }

    const onVisible = () => {
      if (!trackSelf || document.visibilityState !== "visible") return;
      void trackPresence(true);
    };
    if (trackSelf) document.addEventListener("visibilitychange", onVisible);

    const unsubscribeStatus = subscribeLiveRoomChannel(liveRoomId, async (status) => {
      onPresenceStateChangeRef.current?.({ status, reconnectCount });
      if (status !== "SUBSCRIBED") return;
      reconnectCount += 1;
      if (trackSelf) {
        // A new socket has no presence on the server yet — forget what we announced on the old one.
        announced = null;
        await trackPresence(true);
        if (reconnectCount === 1 && !isBigRoom(currentHint())) {
          await channel.send({ type: "broadcast", event: RT_EVENT.viewerJoined, payload: { liveRoomId } });
        }
        if (heartbeatId != null) window.clearInterval(heartbeatId);
        heartbeatId = window.setInterval(() => void trackPresence(true), PRESENCE_HEARTBEAT_MS);
        // Re-check the plan soon after joining: the room-size hint is often stale (or 0) at join time,
        // and the first host broadcast arrives within a few seconds.
        if (settleId != null) window.clearTimeout(settleId);
        settleId = window.setTimeout(() => void trackPresence(false), 8_000 + Math.round(Math.random() * 4_000));
      } else {
        updateCount();
        if (hostPublishId != null) window.clearInterval(hostPublishId);
        hostPublishId = window.setInterval(() => {
          const displayed = stabilizerRef.current.displayed;
          if (displayed != null) publishHostCount(displayed);
        }, HOST_UNCHANGED_PUBLISH_MS);
      }
    });

    return () => {
      if (trackSelf) document.removeEventListener("visibilitychange", onVisible);
      if (heartbeatId != null) window.clearInterval(heartbeatId);
      if (hostPublishId != null) window.clearInterval(hostPublishId);
      if (decreaseFlushId != null) window.clearTimeout(decreaseFlushId);
      if (broadcastFreshId != null) window.clearInterval(broadcastFreshId);
      if (settleId != null) window.clearTimeout(settleId);
      unsubscribeStatus();
      unbindPresence();
      unbindViewerCount();
      if (trackSelf) {
        if (!isBigRoom(currentHint())) {
          void channel.send({ type: "broadcast", event: RT_EVENT.viewerLeft, payload: { liveRoomId } });
        }
        void channel.untrack();
      }
      releaseLiveRoomChannel(supabase, liveRoomId);
    };
    // `viewerDisplayName` / `userId` are read via refs so session hydrate does not remount presence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveRoomId, trackSelf]);

  const nowMs = Date.now();
  const hostBroadcastFresh =
    broadcastAtMs != null && nowMs - broadcastAtMs <= VIEWER_COUNT_BROADCAST_FRESH_MS;
  const roomSizeHintNow = resolveRoomSizeHint({
    broadcastCount,
    broadcastFresh: hostBroadcastFresh,
    snapshotHint: roomSizeHint,
  });

  // Host is the authority — never flip between local and a stale self-echo.
  if (!trackSelf) {
    return { count: localCount, roomSizeHint: roomSizeHintNow, hostBroadcastFresh, draw };
  }

  // Buyers prefer a fresh host broadcast so every device shows the same accurate number.
  return {
    count: resolveDisplayedViewerCount({ broadcastCount, broadcastAtMs, localCount, nowMs }),
    roomSizeHint: roomSizeHintNow,
    hostBroadcastFresh,
    draw,
  };
}
