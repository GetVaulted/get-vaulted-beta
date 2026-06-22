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

export function syncAuctionSeqGuard(state: GuardState, seq: number | null | undefined): void {
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return;
  state.lastAuctionSeq = Math.max(state.lastAuctionSeq, Math.floor(seq));
}

/** True when auctionSeq jumped — caller should reconcile snapshot. */
export function auctionSeqGapDetected(state: GuardState, seq: number): boolean {
  const next = Math.floor(seq);
  return next > state.lastAuctionSeq + 1;
}

/** Returns false when the event should be ignored (duplicate or stale). */
export function shouldProcessRealtimeEvent(
  state: GuardState,
  type: string,
  payload: RoomBroadcastPayload | undefined,
  opts?: { onAuctionSeqGap?: () => void },
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
    const seq = Math.floor(payload.auctionSeq);
    if (seq <= state.lastAuctionSeq) return false;
    if (auctionSeqGapDetected(state, seq)) opts?.onAuctionSeqGap?.();
    state.lastAuctionSeq = seq;
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
