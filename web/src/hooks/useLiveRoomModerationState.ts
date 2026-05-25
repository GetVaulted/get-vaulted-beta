"use client";

import { useCallback, useEffect, useState } from "react";

export type LiveRoomModeratorRow = {
  userId: string;
  username: string;
};

export type LiveRoomModerationState = {
  canModerate: boolean;
  slowModeSeconds: number;
  pinnedModeratorMessage: string | null;
  moderators: LiveRoomModeratorRow[];
  myRestrictions: {
    muted: boolean;
    roomBanned: boolean;
    bidBlocked: boolean;
    kickedUntil: string | null;
  } | null;
};

const EMPTY: LiveRoomModerationState = {
  canModerate: false,
  slowModeSeconds: 0,
  pinnedModeratorMessage: null,
  moderators: [],
  myRestrictions: null,
};

export function useLiveRoomModerationState(liveRoomId: string, enabled = true) {
  const [state, setState] = useState<LiveRoomModerationState>(EMPTY);
  const [roomBlocked, setRoomBlocked] = useState(false);

  const reload = useCallback(async () => {
    if (!liveRoomId || !enabled) return;
    try {
      const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/moderation`, {
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as LiveRoomModerationState & { error?: string };
      if (!res.ok) return;
      setState({
        canModerate: Boolean(j.canModerate),
        slowModeSeconds: j.slowModeSeconds ?? 0,
        pinnedModeratorMessage: j.pinnedModeratorMessage ?? null,
        moderators: Array.isArray(j.moderators)
          ? j.moderators.map((m) => ({
              userId: m.userId,
              username: m.username,
            }))
          : [],
        myRestrictions: j.myRestrictions ?? null,
      });
      const r = j.myRestrictions;
      if (r?.roomBanned || r?.kickedUntil) {
        setRoomBlocked(true);
      }
    } catch {
      /* ignore */
    }
  }, [enabled, liveRoomId]);

  useEffect(() => {
    void reload();
    if (!enabled) return undefined;
    const id = window.setInterval(() => void reload(), 12_000);
    return () => window.clearInterval(id);
  }, [enabled, reload]);

  const handleRestrictionError = useCallback((message: string) => {
    if (
      message.includes("cannot participate") ||
      message.includes("cannot join") ||
      message.includes("muted")
    ) {
      void reload();
    }
    if (message.includes("cannot participate") || message.includes("cannot join")) {
      setRoomBlocked(true);
    }
  }, [reload]);

  return { ...state, roomBlocked, reload, handleRestrictionError };
}
