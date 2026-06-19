"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser-client";
import { roomChannel, RT_EVENT } from "@/lib/realtime-channels";
import { isPinnedMessageActive, msUntilPinnedMessageExpires } from "@/lib/trust/pinned-message-expiry";

export type LiveRoomModeratorRow = {
  userId: string;
  username: string;
};

export type LiveRoomModerationState = {
  canModerate: boolean;
  isHost: boolean;
  isModerator: boolean;
  slowModeSeconds: number;
  pinnedModeratorMessage: string | null;
  pinnedModeratorMessageAt: string | null;
  pinnedModeratorMessageExpiresAt: string | null;
  pinnedModeratorUserId: string | null;
  pinnedModeratorUsername: string | null;
  pinnedModeratorAvatarUrl: string | null;
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
  isHost: false,
  isModerator: false,
  slowModeSeconds: 0,
  pinnedModeratorMessage: null,
  pinnedModeratorMessageAt: null,
  pinnedModeratorMessageExpiresAt: null,
  pinnedModeratorUserId: null,
  pinnedModeratorUsername: null,
  pinnedModeratorAvatarUrl: null,
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
        isHost: Boolean(j.isHost),
        isModerator: Boolean(j.isModerator),
        slowModeSeconds: j.slowModeSeconds ?? 0,
        pinnedModeratorMessage: j.pinnedModeratorMessage ?? null,
        pinnedModeratorMessageAt: j.pinnedModeratorMessageAt ?? null,
        pinnedModeratorMessageExpiresAt: j.pinnedModeratorMessageExpiresAt ?? null,
        pinnedModeratorUserId: j.pinnedModeratorUserId ?? null,
        pinnedModeratorUsername: j.pinnedModeratorUsername ?? null,
        pinnedModeratorAvatarUrl: j.pinnedModeratorAvatarUrl ?? null,
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

  useEffect(() => {
    if (!enabled || !liveRoomId) return undefined;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`${roomChannel(liveRoomId)}:moderation-ui`)
      .on("broadcast", { event: RT_EVENT.moderationChanged }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, liveRoomId, reload]);

  useEffect(() => {
    if (!enabled) return undefined;
    const waitMs = msUntilPinnedMessageExpires({
      expiresAt: state.pinnedModeratorMessageExpiresAt,
      pinnedAt: state.pinnedModeratorMessageAt,
    });
    if (waitMs == null || waitMs <= 0) return undefined;
    const id = window.setTimeout(() => void reload(), waitMs + 250);
    return () => window.clearTimeout(id);
  }, [enabled, reload, state.pinnedModeratorMessageAt, state.pinnedModeratorMessageExpiresAt]);

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

  return {
    ...state,
    roomBlocked,
    reload,
    handleRestrictionError,
    pinnedMessageActive: isPinnedMessageActive({
      message: state.pinnedModeratorMessage,
      expiresAt: state.pinnedModeratorMessageExpiresAt,
      pinnedAt: state.pinnedModeratorMessageAt,
    }),
  };
}
