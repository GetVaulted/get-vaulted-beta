import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';

/** Seek when playback drifts more than this many seconds behind the live edge. */
const LIVE_EDGE_DRIFT_THRESHOLD_S = 2;
/** Stay this many seconds behind live after a corrective seek. */
const LIVE_EDGE_TARGET_OFFSET_S = 0.5;
const LIVE_EDGE_TICK_MS = 750;
const LIVE_EDGE_SEEK_COOLDOWN_MS = 1_500;

/**
 * Periodically nudges HLS playback toward the live edge (expo-video has no HLS.js low-latency mode).
 * Also sets iOS `targetOffsetFromLive` when available.
 */
export function useHlsLiveEdgeSeek(player: VideoPlayer, active: boolean) {
  const lastSeekAtRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;

    try {
      // iOS AVPlayer live offset preference — keep near the edge when metadata exists.
      if (typeof (player as { targetOffsetFromLive?: number }).targetOffsetFromLive === 'number') {
        (player as { targetOffsetFromLive: number }).targetOffsetFromLive = LIVE_EDGE_TARGET_OFFSET_S;
      }
    } catch {
      /* older native builds */
    }

    const tick = () => {
      try {
        const offset = (player as { currentOffsetFromLive?: number | null }).currentOffsetFromLive;
        if (typeof offset === 'number' && Number.isFinite(offset) && offset > LIVE_EDGE_DRIFT_THRESHOLD_S) {
          const now = Date.now();
          if (now - lastSeekAtRef.current < LIVE_EDGE_SEEK_COOLDOWN_MS) return;
          const duration = player.duration;
          if (Number.isFinite(duration) && duration > 0) {
            player.currentTime = Math.max(0, duration - LIVE_EDGE_TARGET_OFFSET_S);
            lastSeekAtRef.current = now;
          }
          return;
        }

        const duration = player.duration;
        const currentTime = player.currentTime;
        if (!Number.isFinite(duration) || duration <= 0) return;
        if (!Number.isFinite(currentTime)) return;

        const liveEdge = duration;
        const driftSeconds = liveEdge - currentTime;
        if (driftSeconds <= LIVE_EDGE_DRIFT_THRESHOLD_S) return;

        const now = Date.now();
        if (now - lastSeekAtRef.current < LIVE_EDGE_SEEK_COOLDOWN_MS) return;

        const target = Math.max(0, liveEdge - LIVE_EDGE_TARGET_OFFSET_S);
        player.currentTime = target;
        lastSeekAtRef.current = now;
      } catch {
        /* seek can fail before media is seekable; next tick retries */
      }
    };

    tick();
    const id = setInterval(tick, LIVE_EDGE_TICK_MS);
    return () => clearInterval(id);
  }, [active, player]);
}
