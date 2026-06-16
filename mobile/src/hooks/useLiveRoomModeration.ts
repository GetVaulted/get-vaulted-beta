import { useCallback, useEffect, useState } from 'react';
import {
  fetchLiveRoomModeration,
  type LiveRoomModerationSnapshot,
  type LiveViewerRole,
} from '../api/trustRepository';

const EMPTY: LiveRoomModerationSnapshot = {
  canModerate: false,
  viewerRole: 'buyer',
  moderatorLevel: null,
  allowedActions: [],
  slowModeSeconds: 0,
  pinnedModeratorMessage: null,
  moderators: [],
  modHistory: [],
  modQueue: [],
  viewers: [],
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
      viewerRole: (snap.viewerRole ?? (snap.canModerate ? 'moderator' : 'buyer')) as LiveViewerRole,
      allowedActions: snap.allowedActions ?? [],
      moderators: snap.moderators ?? [],
      modHistory: snap.modHistory ?? [],
      modQueue: snap.modQueue ?? [],
      viewers: snap.viewers ?? [],
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
