import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';

/** Seek when playback drifts more than this many seconds behind the live edge. */
const LIVE_EDGE_DRIFT_THRESHOLD_S = 1.5;
/** Stay this many seconds behind live after a corrective seek. */
const LIVE_EDGE_TARGET_OFFSET_S = 0.35;
const LIVE_EDGE_TICK_MS = 500;
const LIVE_EDGE_SEEK_COOLDOWN_MS = 900;
/** First few seconds after attach: force live edge harder (DVR window starts cold). */
const LIVE_EDGE_BURST_MS = 6_000;

function seekTowardLiveEdge(player: VideoPlayer, now: number, lastSeekAtRef: { current: number }): void {
  try {
    // Prefer the dedicated live APIs when the stream is tagged live.
    const isLive = Boolean((player as { isLive?: boolean }).isLive);
    try {
      (player as { targetOffsetFromLive: number }).targetOffsetFromLive = LIVE_EDGE_TARGET_OFFSET_S;
    } catch {
      /* older native builds */
    }

    const offset = (player as { currentOffsetFromLive?: number | null }).currentOffsetFromLive;
    if (typeof offset === 'number' && Number.isFinite(offset) && offset > LIVE_EDGE_DRIFT_THRESHOLD_S) {
      if (now - lastSeekAtRef.current < LIVE_EDGE_SEEK_COOLDOWN_MS) return;
      const duration = player.duration;
      if (Number.isFinite(duration) && duration > 0 && duration < 1e7) {
        player.currentTime = Math.max(0, duration - LIVE_EDGE_TARGET_OFFSET_S);
        lastSeekAtRef.current = now;
        return;
      }
      // Live with no finite duration: jump forward by the measured offset.
      const jump = Math.max(0, offset - LIVE_EDGE_TARGET_OFFSET_S);
      if (jump > 0.25 && Number.isFinite(player.currentTime)) {
        player.currentTime = player.currentTime + jump;
        lastSeekAtRef.current = now;
      }
      return;
    }

    if (isLive) return;

    const duration = player.duration;
    const currentTime = player.currentTime;
    if (!Number.isFinite(duration) || duration <= 0 || duration >= 1e7) return;
    if (!Number.isFinite(currentTime)) return;

    const driftSeconds = duration - currentTime;
    if (driftSeconds <= LIVE_EDGE_DRIFT_THRESHOLD_S) return;
    if (now - lastSeekAtRef.current < LIVE_EDGE_SEEK_COOLDOWN_MS) return;

    player.currentTime = Math.max(0, duration - LIVE_EDGE_TARGET_OFFSET_S);
    lastSeekAtRef.current = now;
  } catch {
    /* seek can fail before media is seekable; next tick retries */
  }
}

/**
 * Periodically nudges HLS playback toward the live edge (expo-video has no HLS.js low-latency mode).
 * Also sets iOS `targetOffsetFromLive` when available.
 *
 * Critical for mini-player: a fresh attach often starts at the DVR window head (looks like a replay).
 */
export function useHlsLiveEdgeSeek(player: VideoPlayer, active: boolean) {
  const lastSeekAtRef = useRef(0);
  const attachedAtRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    attachedAtRef.current = Date.now();
    lastSeekAtRef.current = 0;

    const tick = () => {
      const now = Date.now();
      const inBurst = now - attachedAtRef.current < LIVE_EDGE_BURST_MS;
      if (inBurst) {
        // During the burst window, allow more frequent corrections.
        if (now - lastSeekAtRef.current < 350) {
          /* still try targetOffsetFromLive every tick */
          try {
            (player as { targetOffsetFromLive: number }).targetOffsetFromLive = LIVE_EDGE_TARGET_OFFSET_S;
          } catch {
            /* ignore */
          }
        }
      }
      seekTowardLiveEdge(player, now, lastSeekAtRef);
      try {
        if (!player.playing) player.play();
      } catch {
        /* ignore */
      }
    };

    tick();
    const id = setInterval(tick, LIVE_EDGE_TICK_MS);
    return () => clearInterval(id);
  }, [active, player]);
}
