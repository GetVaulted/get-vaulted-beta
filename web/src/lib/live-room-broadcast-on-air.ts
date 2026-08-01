import { isLiveStreamSignal } from "@/lib/live-stream-playback";

export type LiveRoomBroadcastGate = {
  status: string;
  streamHealth: string;
  streamPaused?: boolean | null;
  streamMode?: string | null;
  streamStartedAt?: Date | string | null;
  streamEndedAt?: Date | string | null;
};

function parseGateTimestamp(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** True when IVS (or stage stop) recorded a disconnect while the room is still live. */
export function isLiveStreamDisconnectConfirmed(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== "live") return false;
  const health = room.streamHealth.toLowerCase();
  if (health === "live" || health === "connecting") return false;

  const endedAt = parseGateTimestamp(room.streamEndedAt);
  const startedAt = parseGateTimestamp(room.streamStartedAt);
  // Host republished after a prior disconnect — newer start wins.
  if (startedAt != null && endedAt != null && startedAt > endedAt) return false;

  if (health === "ended") {
    if (endedAt == null) return true;
    if (startedAt != null && endedAt >= startedAt) return true;
    return false;
  }

  if (endedAt == null) return false;
  if (startedAt != null && endedAt >= startedAt) return true;

  return health === "offline" || health === "error";
}

/** Host commerce requires lifecycle live plus an on-air stream signal (or warm-up grace). */
export function isLiveRoomBroadcastOnAir(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== "live") return false;
  if (room.streamPaused === true) return false;
  return isLiveRoomBroadcastSignalReady(room);
}

/**
 * Buy Now / shop / spots stay available while the host is paused.
 * Only a confirmed disconnect (or ended signal) blocks purchases.
 */
export function isLiveRoomBroadcastPurchasable(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== "live") return false;
  return isLiveRoomBroadcastSignalReady(room);
}

function isLiveRoomBroadcastSignalReady(room: LiveRoomBroadcastGate): boolean {
  if (isLiveStreamSignal(room.streamHealth)) return true;

  // Stage / OBS rooms: buyers often still have WebRTC while channel health is sticky offline.
  // Only hard-block when health is ended and a disconnect is confirmed.
  if (room.streamMode === "stage_webrtc" || room.streamMode === "channel_hls") {
    if (room.streamHealth.toLowerCase() === "ended" && isLiveStreamDisconnectConfirmed(room)) {
      return false;
    }
    return true;
  }

  if (isLiveStreamDisconnectConfirmed(room)) return false;
  return room.streamHealth.toLowerCase() !== "ended";
}

/**
 * Strong signal that another device is actually publishing buyer-facing video.
 * Soft commerce warm-up (`stage_webrtc` / offline grace) must not count as companion/elsewhere.
 */
export function isLiveRoomRemotePublisherActive(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== "live") return false;
  if (room.streamPaused === true) return false;
  return isLiveStreamSignal(room.streamHealth);
}
