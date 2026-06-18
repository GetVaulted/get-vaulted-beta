import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomModeration,
  type LiveRoomModerationSnapshot,
  type LiveViewerRole,
} from '../api/trustRepository';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { roomChannel, RT_EVENT } from '../lib/realtimeChannels';

const EMPTY: LiveRoomModerationSnapshot = {
  canModerate: false,
  isHost: false,
  isModerator: false,
  viewerRole: 'buyer',
  moderatorLevel: null,
  allowedActions: [],
  slowModeSeconds: 0,
  pinnedModeratorMessage: null,
  pinnedModeratorMessageExpiresAt: null,
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
    setState({
      ...EMPTY,
      ...snap,
      isHost: Boolean(snap.isHost),
      isModerator: Boolean(snap.isModerator),
      viewerRole: (snap.viewerRole ?? 'buyer') as LiveViewerRole,
      allowedActions: snap.allowedActions ?? [],
      pinnedModeratorMessageExpiresAt: snap.pinnedModeratorMessageExpiresAt ?? null,
      moderators: snap.moderators ?? [],
      modHistory: snap.modHistory ?? [],
      modQueue: snap.modQueue ?? [],
      viewers: snap.viewers ?? [],
      tips: snap.tips ?? [],
      tipSummary: snap.tipSummary ?? null,
    });
    const r = snap.myRestrictions;
    if (r?.roomBanned || r?.kickedUntil || r?.sellerStreamBanned) setRoomBlocked(true);
  }, [args.accessToken, args.enabled, args.roomId]);

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

  return { ...state, roomBlocked, reload, handleRestrictionError };
}
