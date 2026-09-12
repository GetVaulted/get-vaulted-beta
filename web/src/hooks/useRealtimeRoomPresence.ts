"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { countRoomPresenceViewers } from "@/lib/live-room-presence-count";
import { buildPresenceChannelKey } from "@/lib/live-room-presence-key";
import {
  parseViewerCountBroadcast,
  shouldPublishViewerCountBroadcast,
} from "@/lib/live-room-viewer-count-broadcast";
import {
  createViewerCountStabilizerState,
  nextStabilizedViewerCount,
  resolveDisplayedViewerCount,
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

export function useRealtimeRoomPresence(opts: {
  liveRoomId: string | null;
  enabled?: boolean;
  userId?: string | null;
  /** When false, observe presence only (host console — do not count yourself). Default true. */
  trackSelf?: boolean;
  /** Shown in chat when another viewer joins (leave events are not surfaced to chat). */
  viewerDisplayName?: string | null;
  onViewerEvent?: (event: ViewerPresenceChatEvent) => void;
  onPresenceStateChange?: (state: { status: string; reconnectCount: number }) => void;
}): number | null {
  const {
    liveRoomId,
    enabled = true,
    userId = null,
    trackSelf = true,
    viewerDisplayName = null,
    onViewerEvent,
    onPresenceStateChange,
  } = opts;
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [broadcastCount, setBroadcastCount] = useState<number | null>(null);
  const [broadcastAtMs, setBroadcastAtMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const onViewerEventRef = useRef(onViewerEvent);
  const onPresenceStateChangeRef = useRef(onPresenceStateChange);
  const viewerDisplayNameRef = useRef(viewerDisplayName);
  const userIdRef = useRef(userId);
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

    const updateCount = () => {
      const raw = countRoomPresenceViewers(channel.presenceState());
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

    const trackPresence = async () => {
      if (!trackSelf) return;
      const uid = userIdRef.current;
      const username = resolvePresenceChatLabel(viewerDisplayNameRef.current, uid);
      await channel.track({
        tabKey: presenceKey,
        userId: uid,
        username,
        liveRoomId,
        at: new Date().toISOString(),
      });
      updateCount();
    };

    // Bind via shared multiplexer — safe if moderation/subscription already retained the channel,
    // and safe when this effect re-runs after session hydrate (userId change).
    const unbindPresence = bindLiveRoomPresenceHandlers(liveRoomId, {
      onSync: updateCount,
      onJoin: (payload) => {
        for (const p of payload?.newPresences ?? []) {
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
      setBroadcastCount(n);
      setBroadcastAtMs(Date.now());
    });

    // Re-evaluate broadcast freshness so buyers fall back to local after the window expires.
    if (trackSelf) {
      broadcastFreshId = window.setInterval(() => setTick((t) => t + 1), 2_000);
    }

    const onVisible = () => {
      if (!trackSelf || document.visibilityState !== "visible") return;
      void trackPresence();
    };
    if (trackSelf) document.addEventListener("visibilitychange", onVisible);

    const unsubscribeStatus = subscribeLiveRoomChannel(liveRoomId, async (status) => {
      onPresenceStateChangeRef.current?.({ status, reconnectCount });
      if (status !== "SUBSCRIBED") return;
      reconnectCount += 1;
      if (trackSelf) {
        await trackPresence();
        if (reconnectCount === 1) {
          await channel.send({ type: "broadcast", event: RT_EVENT.viewerJoined, payload: { liveRoomId } });
        }
        if (heartbeatId != null) window.clearInterval(heartbeatId);
        heartbeatId = window.setInterval(() => void trackPresence(), PRESENCE_HEARTBEAT_MS);
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
      unsubscribeStatus();
      unbindPresence();
      unbindViewerCount();
      if (trackSelf) {
        void channel.send({ type: "broadcast", event: RT_EVENT.viewerLeft, payload: { liveRoomId } });
        void channel.untrack();
      }
      releaseLiveRoomChannel(supabase, liveRoomId);
    };
    // `viewerDisplayName` / `userId` are read via refs so session hydrate does not remount presence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveRoomId, trackSelf]);

  // Host is the authority — never flip between local and a stale self-echo.
  if (!trackSelf) return localCount;

  // Buyers prefer a fresh host broadcast so every device shows the same accurate number.
  return resolveDisplayedViewerCount({
    broadcastCount,
    broadcastAtMs,
    localCount,
    nowMs: Date.now(),
  });
}
