import type { RoomBroadcastPayload } from './realtimeChannels';

const DEDUPE_MS = 2500;

type GuardState = {
  seenEventIds: Map<string, number>;
  lastAuctionSeq: number;
  lastRoomVersion: number;
  lastItemVersionByItem: Map<string, number>;
};

export function createRealtimeEventGuard(): GuardState {
  return {
    seenEventIds: new Map(),
    lastAuctionSeq: 0,
    lastRoomVersion: 0,
    lastItemVersionByItem: new Map(),
  };
}

function pruneSeen(state: GuardState, now: number) {
  for (const [id, ts] of state.seenEventIds) {
    if (now - ts > DEDUPE_MS * 4) state.seenEventIds.delete(id);
  }
}

/** Returns false when the event should be ignored (duplicate or stale). */
export function shouldProcessRealtimeEvent(
  state: GuardState,
  type: string,
  payload: RoomBroadcastPayload | undefined,
): boolean {
  const now = Date.now();
  pruneSeen(state, now);

  const eventId = payload?.eventId?.trim();
  if (eventId) {
    const prev = state.seenEventIds.get(eventId);
    if (prev != null && now - prev < DEDUPE_MS) return false;
    state.seenEventIds.set(eventId, now);
  }

  if (type === 'bid_placed' && typeof payload?.auctionSeq === 'number') {
    if (payload.auctionSeq <= state.lastAuctionSeq) return false;
    state.lastAuctionSeq = payload.auctionSeq;
    return true;
  }

  if (typeof payload?.roomVersion === 'number') {
    if (payload.roomVersion < state.lastRoomVersion) return false;
    state.lastRoomVersion = payload.roomVersion;
  }

  if (typeof payload?.itemVersion === 'number' && payload.itemId) {
    const last = state.lastItemVersionByItem.get(payload.itemId) ?? 0;
    if (payload.itemVersion < last) return false;
    state.lastItemVersionByItem.set(payload.itemId, payload.itemVersion);
  }

  return true;
}
