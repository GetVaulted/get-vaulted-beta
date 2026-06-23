/** Count distinct presence slots on a Supabase Realtime room channel. */
export function countRoomPresenceViewers(state: Record<string, unknown>): number {
  return Object.keys(state).length;
}
