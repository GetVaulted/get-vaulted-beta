/**
 * Smooth live viewer counts so brief presence flaps (heartbeat re-track, reconnect)
 * don't make the UI bounce. Increases apply immediately; decreases must hold steady.
 */

export type ViewerCountStabilizerState = {
  displayed: number | null;
  pendingDecrease: number | null;
  pendingSinceMs: number | null;
};

export const VIEWER_COUNT_DECREASE_HOLD_MS = 2_500;
/** Buyers trust the host-published count if received within this window. */
export const VIEWER_COUNT_BROADCAST_FRESH_MS = 12_000;

export function createViewerCountStabilizerState(): ViewerCountStabilizerState {
  return { displayed: null, pendingDecrease: null, pendingSinceMs: null };
}

export function nextStabilizedViewerCount(
  state: ViewerCountStabilizerState,
  raw: number,
  nowMs: number,
  decreaseHoldMs = VIEWER_COUNT_DECREASE_HOLD_MS,
): ViewerCountStabilizerState {
  const next = Math.max(0, Math.floor(raw));
  if (state.displayed == null) {
    return { displayed: next, pendingDecrease: null, pendingSinceMs: null };
  }
  if (next >= state.displayed) {
    return { displayed: next, pendingDecrease: null, pendingSinceMs: null };
  }
  if (state.pendingDecrease === next && state.pendingSinceMs != null) {
    if (nowMs - state.pendingSinceMs >= decreaseHoldMs) {
      return { displayed: next, pendingDecrease: null, pendingSinceMs: null };
    }
    return state;
  }
  return {
    displayed: state.displayed,
    pendingDecrease: next,
    pendingSinceMs: nowMs,
  };
}

/** Prefer a fresh host broadcast; otherwise fall back to the local stabilized count. */
export function resolveDisplayedViewerCount(args: {
  broadcastCount: number | null;
  broadcastAtMs: number | null;
  localCount: number | null;
  nowMs: number;
  broadcastFreshMs?: number;
}): number | null {
  const freshMs = args.broadcastFreshMs ?? VIEWER_COUNT_BROADCAST_FRESH_MS;
  if (
    args.broadcastCount != null &&
    args.broadcastAtMs != null &&
    args.nowMs - args.broadcastAtMs <= freshMs
  ) {
    return args.broadcastCount;
  }
  return args.localCount;
}
