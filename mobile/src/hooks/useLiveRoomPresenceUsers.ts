import { useEffect, useState } from 'react';
import { parseRoomPresenceUsers, sameRoomPresenceRoster, type RoomPresenceUser } from '../lib/liveRoomPresenceUsers';
import { peekLiveRoomChannel } from '../lib/liveRoomSharedChannel';

/** Read current presence roster from the shared live room channel (no extra subscription). */
export function useLiveRoomPresenceUsers(liveRoomId: string, enabled: boolean): RoomPresenceUser[] {
  const [users, setUsers] = useState<RoomPresenceUser[]>([]);

  useEffect(() => {
    if (!enabled || !liveRoomId) {
      setUsers([]);
      return undefined;
    }

    let active = true;
    const setRoster = (next: RoomPresenceUser[]) =>
      setUsers((prev) => (sameRoomPresenceRoster(prev, next) ? prev : next));

    const sync = () => {
      if (!active) return;
      const channel = peekLiveRoomChannel(liveRoomId);
      if (!channel) {
        setRoster([]);
        return;
      }
      try {
        setRoster(parseRoomPresenceUsers(channel.presenceState()));
      } catch {
        setRoster([]);
      }
    };

    sync();
    const pollId = setInterval(sync, 2000);

    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [enabled, liveRoomId]);

  return users;
}
