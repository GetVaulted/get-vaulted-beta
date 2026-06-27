import { useEffect, useState } from 'react';
import { parseRoomPresenceUsers, type RoomPresenceUser } from '../lib/liveRoomPresenceUsers';
import { peekLiveRoomChannel } from '../lib/liveRoomSharedChannel';

/** Read current presence roster from the shared live room channel (no extra subscription). */
export function useLiveRoomPresenceUsers(liveRoomId: string, enabled: boolean): RoomPresenceUser[] {
  const [users, setUsers] = useState<RoomPresenceUser[]>([]);

  useEffect(() => {
    if (!enabled || !liveRoomId) {
      setUsers([]);
      return undefined;
    }

    const sync = () => {
      const channel = peekLiveRoomChannel(liveRoomId);
      if (!channel) {
        setUsers([]);
        return;
      }
      setUsers(parseRoomPresenceUsers(channel.presenceState() as Record<string, unknown>));
    };

    sync();
    const pollId = setInterval(sync, 2500);
    const channel = peekLiveRoomChannel(liveRoomId);
    if (channel) {
      channel.on('presence', { event: 'sync' }, sync);
      channel.on('presence', { event: 'join' }, sync);
      channel.on('presence', { event: 'leave' }, sync);
    }

    return () => {
      clearInterval(pollId);
    };
  }, [enabled, liveRoomId]);

  return users;
}
