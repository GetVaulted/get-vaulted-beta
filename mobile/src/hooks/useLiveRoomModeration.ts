import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomModeration,
  type LiveRoomModerationSnapshot,
  type LiveViewerRole,
} from '../api/trustRepository';
import { peekLiveRoomChannel, subscribeLiveRoomChannel } from '../lib/liveRoomSharedChannel';
import { RT_EVENT } from '../lib/realtimeChannels';
import { isSupabaseConfigured } from '../lib/supabase';
import { isPinnedMessageActive, msUntilPinnedMessageExpires } from '../lib/pinnedMessageExpiry';

/** Fallback cadence while this room's realtime channel isn't confirmed SUBSCRIBED. */
const MODERATION_POLL_MS = 12_000;
/**
 * Reconciliation-only cadence once the shared room channel reports SUBSCRIBED — the
 * moderationChanged broadcast handler below already triggers an immediate `reload()` on every
 * real change, so this is a safety net for a missed broadcast, not the primary signal path.
 * Mirrors the same connected-vs-disconnected pattern used for stream-status and room-snapshot
 * polling (see scaling-plan-2026-09-08.md Phase 3).
 */
const MODERATION_POLL_CONNECTED_MS = 30_000;

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
  recentSales: [],
  paymentFailures: [],
  myRestrictions: null,
};

export function useLiveRoomModeration(args: {
  roomId: string;
  accessToken?: string;
  enabled?: boolean;
}) {
  const [state, setState] = useState<LiveRoomModerationSnapshot>(EMPTY);
  const [roomBlocked, setRoomBlocked] = useState(false);
  /** True once this room's shared realtime channel confirms SUBSCRIBED (see the combined
   * broadcast+status subscription effect below). Drives the poll-cadence backoff. */
  const [realtimeConnected, setRealtimeConnected] = useState(false);

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
        recentSales: Array.isArray(snap.recentSales) ? snap.recentSales : [],
        paymentFailures: Array.isArray(snap.paymentFailures) ? snap.paymentFailures : [],
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
    const pollMs = realtimeConnected ? MODERATION_POLL_CONNECTED_MS : MODERATION_POLL_MS;
    const id = setInterval(() => void reload(), pollMs);
    return () => clearInterval(id);
  }, [args.enabled, reload, realtimeConnected]);

  useEffect(() => {
    if (args.enabled === false || !args.roomId || !isSupabaseConfigured()) {
      setRealtimeConnected(false);
      return undefined;
    }

    let cancelled = false;
    let detach: (() => void) | undefined;
    let detachStatus: (() => void) | undefined;

    const attach = () => {
      if (cancelled || detach) return;
      const channel = peekLiveRoomChannel(args.roomId);
      if (!channel) return;
      let active = true;
      const handler = () => {
        if (!active || cancelled) return;
        void reload();
      };
      channel.on('broadcast', { event: RT_EVENT.moderationChanged }, handler);
      detach = () => {
        active = false;
      };
      // Real subscription status (not just "channel object exists") — drives the poll backoff.
      detachStatus = subscribeLiveRoomChannel(args.roomId, (status) => {
        if (cancelled) return;
        setRealtimeConnected(status === 'SUBSCRIBED');
      });
    };

    attach();
    const retry = setInterval(attach, 400);

    return () => {
      cancelled = true;
      clearInterval(retry);
      detach?.();
      detachStatus?.();
      setRealtimeConnected(false);
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
