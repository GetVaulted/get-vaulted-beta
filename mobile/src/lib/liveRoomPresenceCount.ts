import { parseRoomPresenceUsers } from './liveRoomPresenceUsers';

/** Count unique viewers from Supabase Realtime presence (dedupes signed-in users across tabs). */
export function countRoomPresenceViewers(state: Record<string, unknown>): number {
  return parseRoomPresenceUsers(state).length;
}
