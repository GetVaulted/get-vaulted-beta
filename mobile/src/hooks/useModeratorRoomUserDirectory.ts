import { useEffect, useMemo, useState } from 'react';
import { fetchProfileUsernamesByIds } from '../api/profilesRepository';
import type { LiveRoomModHistoryRow, LiveRoomViewerRow, LiveModeratorLevel } from '../api/trustRepository';
import { mergeModeratorRoomUsers, type ModeratorRoomUserRow } from '../lib/mergeModeratorRoomUsers';
import {
  buildModeratorUsernameHints,
  isPlaceholderModeratorUsername,
} from '../lib/moderatorRoomDisplayUsername';
import type { RoomPresenceUser } from '../lib/liveRoomPresenceUsers';

export function useModeratorRoomUserDirectory(args: {
  visible: boolean;
  presence: RoomPresenceUser[];
  viewers: LiveRoomViewerRow[];
  moderators: Array<{ userId: string; username?: string | null; moderatorLevel?: LiveModeratorLevel }>;
  modHistory: LiveRoomModHistoryRow[];
}): ModeratorRoomUserRow[] {
  const [resolvedUsernames, setResolvedUsernames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!args.visible) {
      setResolvedUsernames({});
    }
  }, [args.visible]);

  const usernameByUserId = useMemo(
    () =>
      buildModeratorUsernameHints({
        resolved: resolvedUsernames,
        moderators: args.moderators,
        viewers: args.viewers,
        modHistory: args.modHistory,
      }),
    [args.modHistory, args.moderators, resolvedUsernames, args.viewers],
  );

  const roomUsers = useMemo(
    () =>
      mergeModeratorRoomUsers({
        presence: args.presence,
        viewers: args.viewers,
        usernameByUserId,
      }),
    [args.presence, args.viewers, usernameByUserId],
  );

  useEffect(() => {
    if (!args.visible) return;

    const missing = new Set<string>();
    for (const row of roomUsers) {
      if (!row.userId || row.isGuest) continue;
      if (isPlaceholderModeratorUsername(row.username) && !usernameByUserId[row.userId]) {
        missing.add(row.userId);
      }
    }
    for (const p of args.presence) {
      if (!p.userId) continue;
      if (isPlaceholderModeratorUsername(p.username) && !usernameByUserId[p.userId]) {
        missing.add(p.userId);
      }
    }

    const ids = [...missing];
    if (!ids.length) return;

    let cancelled = false;
    void fetchProfileUsernamesByIds(ids).then((fetched) => {
      if (cancelled || !Object.keys(fetched).length) return;
      setResolvedUsernames((prev) => ({ ...prev, ...fetched }));
    });

    return () => {
      cancelled = true;
    };
  }, [args.presence, args.visible, roomUsers, usernameByUserId]);

  return roomUsers;
}
