export type LiveRoomBroadcastGate = {
  status: string;
  streamHealth: string;
  streamPaused?: boolean | null;
};

function isLiveStreamSignal(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === 'live' || h === 'connecting';
}

/** Host commerce (auctions, checkout) requires lifecycle live plus an on-air stream signal. */
export function isLiveRoomBroadcastOnAir(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== 'live') return false;
  if (room.streamPaused === true) return false;
  return isLiveStreamSignal(room.streamHealth);
}
