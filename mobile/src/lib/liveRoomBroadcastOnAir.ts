export type LiveRoomBroadcastGate = {
  status: string;
  streamHealth: string;
  streamPaused?: boolean | null;
  streamMode?: string | null;
  streamStartedAt?: string | null;
  streamEndedAt?: string | null;
};

function isLiveStreamSignal(streamHealth: string): boolean {
  const h = streamHealth.toLowerCase();
  return h === 'live' || h === 'connecting';
}

function parseGateTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isLiveStreamDisconnectConfirmed(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== 'live') return false;
  const health = room.streamHealth.toLowerCase();
  if (health === 'live' || health === 'connecting') return false;

  const endedAt = parseGateTimestamp(room.streamEndedAt);
  const startedAt = parseGateTimestamp(room.streamStartedAt);
  if (startedAt != null && endedAt != null && startedAt > endedAt) return false;

  if (health === 'ended') {
    if (endedAt == null) return true;
    if (startedAt != null && endedAt >= startedAt) return true;
    return false;
  }

  if (endedAt == null) return false;
  if (startedAt != null && endedAt >= startedAt) return true;

  return health === 'offline' || health === 'error';
}

/** Host commerce (auctions) requires lifecycle live plus an on-air stream signal. */
export function isLiveRoomBroadcastOnAir(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== 'live') return false;
  if (room.streamPaused === true) return false;
  return isLiveRoomBroadcastSignalReady(room);
}

/**
 * Buy Now / shop / spots stay available while the host is paused.
 * Only a confirmed disconnect (or ended signal) blocks purchases.
 */
export function isLiveRoomBroadcastPurchasable(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== 'live') return false;
  return isLiveRoomBroadcastSignalReady(room);
}

function isLiveRoomBroadcastSignalReady(room: LiveRoomBroadcastGate): boolean {
  if (isLiveStreamSignal(room.streamHealth)) return true;

  // Stage / OBS rooms: buyers often still have WebRTC while channel health is sticky offline.
  // Only hard-block when health is ended and a disconnect is confirmed.
  if (room.streamMode === 'stage_webrtc' || room.streamMode === 'channel_hls') {
    if (room.streamHealth.toLowerCase() === 'ended' && isLiveStreamDisconnectConfirmed(room)) {
      return false;
    }
    return true;
  }

  if (isLiveStreamDisconnectConfirmed(room)) return false;
  return room.streamHealth.toLowerCase() !== 'ended';
}

/**
 * Strong signal that another device is actually publishing buyer-facing video.
 * Do NOT use soft commerce warm-up (`stage_webrtc` / default-true) — that falsely
 * marks a lone host phone as “Live elsewhere” when Stage hasn’t started yet.
 *
 * `connecting` means “waiting on host / no Stage publisher” (see server
 * `reconcileStagePublisherHealth`) — never treat that as a remote publisher, or a
 * force-quit → reopen falsely enters companion mode and skips camera auto-resume.
 */
export function isLiveRoomRemotePublisherActive(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== 'live') return false;
  if (room.streamPaused === true) return false;
  return room.streamHealth.toLowerCase() === 'live';
}

export const LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR =
  'The host stream is offline. Purchases and bids are paused until they reconnect.';

export const LIVE_STREAM_PAUSED_COMMERCE_ERROR =
  'The host paused the stream. Bidding is paused — Buy Now and shop are still available.';

export function liveBroadcastCommerceBlockMessage(room: LiveRoomBroadcastGate): string | null {
  if (room.status !== 'live') return null;
  if (isLiveRoomBroadcastOnAir(room)) return null;
  if (room.streamPaused === true) return LIVE_STREAM_PAUSED_COMMERCE_ERROR;
  return LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR;
}

export function isLiveBroadcastCommerceBlocked(room: LiveRoomBroadcastGate): boolean {
  return liveBroadcastCommerceBlockMessage(room) != null;
}

/** Offline-only gate for Buy Now / shop / spots (host pause does not block). */
export function liveBroadcastPurchaseBlockMessage(room: LiveRoomBroadcastGate): string | null {
  if (room.status !== 'live') return null;
  if (isLiveRoomBroadcastPurchasable(room)) return null;
  return LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR;
}

export function isLiveBroadcastPurchaseBlocked(room: LiveRoomBroadcastGate): boolean {
  return liveBroadcastPurchaseBlockMessage(room) != null;
}
