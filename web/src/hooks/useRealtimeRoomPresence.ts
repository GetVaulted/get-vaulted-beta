"use client";

import { useEffect, useRef, useState } from "react";
import { countRoomPresenceViewers } from "@/lib/live-room-presence-count";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { roomChannel, RT_EVENT } from "@/lib/realtime-channels";

export type ViewerPresenceChatEvent = { kind: "joined"; label: string };

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

function stablePresenceKey(liveRoomId: string, userId: string | null): string {
  const base = userId ? `u:${userId}` : "guest";
  const key = `gv-presence:${base}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return `${liveRoomId}:${existing}`;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(key, created);
  return `${liveRoomId}:${created}`;
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
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  const onViewerEventRef = useRef(onViewerEvent);
  const onPresenceStateChangeRef = useRef(onPresenceStateChange);
  onViewerEventRef.current = onViewerEvent;
  onPresenceStateChangeRef.current = onPresenceStateChange;

  useEffect(() => {
    if (!enabled || !liveRoomId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const presenceSlot = trackSelf ? stablePresenceKey(liveRoomId, userId) : "";
    const channel = supabase.channel(
      roomChannel(liveRoomId),
      trackSelf ? { config: { presence: { key: presenceSlot } } } : undefined,
    );
    let reconnectCount = 0;
    let heartbeatId: number | null = null;
    /** Cleared on matching presence `leave` so that viewer can get one join line again later. */
    const joinedChatAnnounced = new Set<string>();

    const updateCount = () => {
      const state = channel.presenceState<Record<string, unknown>[]>();
      setViewerCount(countRoomPresenceViewers(state));
    };

    const trackPresence = async () => {
      const username = resolvePresenceChatLabel(viewerDisplayName, userId);
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
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, (payload: { newPresences?: Record<string, unknown>[] }) => {
        for (const p of payload?.newPresences ?? []) {
          const id = joinAnnounceId(p, liveRoomId);
          if (!id || joinedChatAnnounced.has(id)) continue;
          joinedChatAnnounced.add(id);
          const label = resolvePresenceChatLabel(p.username, p.userId);
          onViewerEventRef.current?.({ kind: "joined", label });
        }
        updateCount();
      })
      .on("presence", { event: "leave" }, (payload: { leftPresences?: Record<string, unknown>[] }) => {
        for (const p of payload?.leftPresences ?? []) {
          const id = joinAnnounceId(p, liveRoomId);
          if (id) joinedChatAnnounced.delete(id);
        }
        updateCount();
      });

    const onVisible = () => {
      if (!trackSelf || document.visibilityState !== "visible") return;
      void trackPresence();
    };
    if (trackSelf) document.addEventListener("visibilitychange", onVisible);

    void channel.subscribe(async (status) => {
      onPresenceStateChangeRef.current?.({ status, reconnectCount });
      if (status !== "SUBSCRIBED") return;
      reconnectCount += 1;
      if (trackSelf) {
        await trackPresence();
        if (reconnectCount === 1) {
          await channel.send({ type: "broadcast", event: RT_EVENT.viewerJoined, payload: { liveRoomId } });
        }
        if (heartbeatId != null) window.clearInterval(heartbeatId);
        heartbeatId = window.setInterval(() => void trackPresence(), 25000);
      } else {
        updateCount();
      }
    });

    return () => {
      if (trackSelf) document.removeEventListener("visibilitychange", onVisible);
      if (heartbeatId != null) window.clearInterval(heartbeatId);
      if (trackSelf) {
        void channel.send({ type: "broadcast", event: RT_EVENT.viewerLeft, payload: { liveRoomId } });
        void channel.untrack();
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, liveRoomId, trackSelf, userId, viewerDisplayName]);

  return viewerCount;
}
