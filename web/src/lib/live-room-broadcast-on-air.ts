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
  if (health === "ended") return true;

  const endedAt = parseGateTimestamp(room.streamEndedAt);
  if (endedAt == null) return false;

  const startedAt = parseGateTimestamp(room.streamStartedAt);
  if (startedAt != null && endedAt >= startedAt) return true;

  return health === "offline" || health === "error";
}

/** Host commerce requires lifecycle live plus an on-air stream signal (or warm-up grace). */
export function isLiveRoomBroadcastOnAir(room: LiveRoomBroadcastGate): boolean {
  if (room.status !== "live") return false;
  if (room.streamPaused === true) return false;
  if (isLiveStreamSignal(room.streamHealth)) return true;
  if (room.streamHealth.toLowerCase() === "ended") return false;
  if (room.streamMode === "stage_webrtc") return true;
  if (isLiveStreamDisconnectConfirmed(room)) return false;
  return true;
}
