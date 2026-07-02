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

export const LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR =
  'The host stream is offline. Purchases and bids are paused until they reconnect.';

export const LIVE_STREAM_PAUSED_COMMERCE_ERROR =
  'The host paused the stream. Purchases and bids are paused.';

export function liveBroadcastCommerceBlockMessage(room: LiveRoomBroadcastGate): string | null {
  if (room.status !== 'live') return null;
  if (isLiveRoomBroadcastOnAir(room)) return null;
  if (room.streamPaused === true) return LIVE_STREAM_PAUSED_COMMERCE_ERROR;
  return LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR;
}

export function isLiveBroadcastCommerceBlocked(room: LiveRoomBroadcastGate): boolean {
  return liveBroadcastCommerceBlockMessage(room) != null;
}
