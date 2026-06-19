import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomModeration,
  type LiveRoomModerationSnapshot,
  type LiveViewerRole,
} from '../api/trustRepository';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { roomChannel, RT_EVENT } from '../lib/realtimeChannels';
import { isPinnedMessageActive, msUntilPinnedMessageExpires } from '../lib/pinnedMessageExpiry';

const EMPTY: LiveRoomModerationSnapshot = {
  canModerate: false,
  isHost: false,
  isModerator: false,
  viewerRole: 'buyer',
  moderatorLevel: null,
  allowedActions: [],
  slowModeSeconds: 0,
  pinnedModeratorMessage: null,
  pinnedModeratorMessageAt: null,
  pinnedModeratorMessageExpiresAt: null,
  pinnedModeratorUserId: null,
  pinnedModeratorUsername: null,
  pinnedModeratorAvatarUrl: null,
  moderators: [],
  modHistory: [],
  modQueue: [],
  viewers: [],
  tips: [],
  tipSummary: null,
  myRestrictions: null,
};

export function useLiveRoomModeration(args: {
  roomId: string;
  accessToken?: string;
  enabled?: boolean;
}) {
  const [state, setState] = useState<LiveRoomModerationSnapshot>(EMPTY);
  const [roomBlocked, setRoomBlocked] = useState(false);

  const reload = useCallback(async () => {
    if (!args.roomId || args.enabled === false) return;
    const snap = await fetchLiveRoomModeration({
      roomId: args.roomId,
      accessToken: args.accessToken,
    });
    if (!snap) return;
    setState((prev) => {
      const nextPinnedMessage = snap.pinnedModeratorMessage ?? null;
      const prevPinnedAt = prev.pinnedModeratorMessageAt?.trim();
      const prevBody = prev.pinnedModeratorMessage?.trim();
      const prevPinnedMs = prevPinnedAt ? new Date(prevPinnedAt).getTime() : 0;
      const keepOptimisticPin =
        !nextPinnedMessage?.trim() &&
        Boolean(prevBody) &&
        prevPinnedMs > 0 &&
        Date.now() - prevPinnedMs < 8000;

      return {
        ...EMPTY,
        ...snap,
        isHost: Boolean(snap.isHost),
        isModerator: Boolean(snap.isModerator),
        viewerRole: (snap.viewerRole ?? 'buyer') as LiveViewerRole,
        allowedActions: snap.allowedActions ?? [],
        sellerId: snap.sellerId,
        pinnedModeratorMessage: keepOptimisticPin ? prev.pinnedModeratorMessage : (snap.pinnedModeratorMessage ?? null),
        pinnedModeratorMessageAt: keepOptimisticPin ? prev.pinnedModeratorMessageAt : (snap.pinnedModeratorMessageAt ?? null),
        pinnedModeratorMessageExpiresAt: keepOptimisticPin
          ? prev.pinnedModeratorMessageExpiresAt
          : (snap.pinnedModeratorMessageExpiresAt ?? null),
        pinnedModeratorUserId: keepOptimisticPin ? prev.pinnedModeratorUserId : (snap.pinnedModeratorUserId ?? null),
        pinnedModeratorUsername: keepOptimisticPin ? prev.pinnedModeratorUsername : (snap.pinnedModeratorUsername ?? null),
        pinnedModeratorAvatarUrl: keepOptimisticPin ? prev.pinnedModeratorAvatarUrl : (snap.pinnedModeratorAvatarUrl ?? null),
        moderators: snap.moderators ?? [],
        modHistory: snap.modHistory ?? [],
        modQueue: snap.modQueue ?? [],
        viewers: snap.viewers ?? [],
        tips: snap.tips ?? [],
        tipSummary: snap.tipSummary ?? null,
      };
    });
    const r = snap.myRestrictions;
    if (r?.roomBanned || r?.kickedUntil || r?.sellerStreamBanned) setRoomBlocked(true);
  }, [args.accessToken, args.enabled, args.roomId]);

  const patch = useCallback((partial: Partial<LiveRoomModerationSnapshot>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    void reload();
    if (args.enabled === false) return undefined;
    const id = setInterval(() => void reload(), 12_000);
    return () => clearInterval(id);
  }, [args.enabled, reload]);

  useEffect(() => {
    if (args.enabled === false || !args.roomId || !isSupabaseConfigured()) return undefined;
    const supabase = getSupabase();
    if (!supabase) return undefined;

    const channel = supabase
      .channel(`${roomChannel(args.roomId)}:moderation`)
      .on('broadcast', { event: RT_EVENT.moderationChanged }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [args.enabled, args.roomId, reload]);

  useEffect(() => {
    if (args.enabled === false) return undefined;
    const waitMs = msUntilPinnedMessageExpires({
      expiresAt: state.pinnedModeratorMessageExpiresAt,
      pinnedAt: state.pinnedModeratorMessageAt,
    });
    if (waitMs == null || waitMs <= 0) return undefined;
    const id = setTimeout(() => void reload(), waitMs + 250);
    return () => clearTimeout(id);
  }, [args.enabled, reload, state.pinnedModeratorMessageAt, state.pinnedModeratorMessageExpiresAt]);

  const handleRestrictionError = useCallback(
    (message: string) => {
      if (
        message.includes('cannot participate') ||
        message.includes('cannot join') ||
        message.includes('muted') ||
        message.includes('Slow mode')
      ) {
        void reload();
      }
      if (message.includes('cannot participate') || message.includes('cannot join')) {
        setRoomBlocked(true);
      }
    },
    [reload],
  );

  return {
    ...state,
    roomBlocked,
    reload,
    patch,
    handleRestrictionError,
    pinnedMessageActive: isPinnedMessageActive({
      message: state.pinnedModeratorMessage,
      expiresAt: state.pinnedModeratorMessageExpiresAt,
      pinnedAt: state.pinnedModeratorMessageAt,
    }),
  };
}
