/**
 * Pure decision logic for recovering "zombie" live rooms.
 *
 * A zombie is a room still flagged `live` in the DB after the host's WebRTC publisher dropped
 * (app backgrounded / network / crash) and never came back. With no publisher on the Stage there is
 * no video for WebRTC viewers to subscribe to and no source for the HLS mirror — so both app viewers
 * and guests see a broken "live" forever, and the composition heal loops uselessly.
 *
 * The soft-disconnect design (see `endHostStageSession`) intentionally keeps the room live when a
 * host briefly drops so they can tap Go Live again. This recovery only acts once the host has been
 * absent well past that reconnect window.
 */

/** Ignore rooms this fresh after go-live — the host stage session may still be connecting. */
export const STUCK_LIVE_GRACE_MS = 60_000;
/** Publisher absent at least this long → nudge (observability / host prompt). */
export const STUCK_LIVE_WARN_MS = 45_000;
/** Publisher absent at least this long → auto-end the abandoned show. */
export const STUCK_LIVE_AUTO_END_MS = 5 * 60_000;

export type StuckLiveAction = "healthy" | "wait" | "warn_rejoin" | "auto_end";

export type StuckLiveInput = {
  /** Is anyone currently publishing (host camera/mic) on the Stage? */
  hasPublisher: boolean;
  /** now - streamStartedAt, in ms (use a large number when unknown). */
  msSinceStreamStart: number;
  /** now - hostAbsentSince, in ms. Use Infinity when the host is present or absence is not yet marked. */
  msSincePublisherAbsent: number;
};

/**
 * Decide how to treat a `live` stage room.
 * - "healthy": a publisher is present → clear any absence marker.
 * - "wait": too soon to judge (inside go-live grace, or absence just started).
 * - "warn_rejoin": publisher gone a while → surface it (host prompt / logging), no teardown.
 * - "auto_end": publisher gone long enough that the show is abandoned → end it.
 */
export function decideStuckLiveAction(input: StuckLiveInput): StuckLiveAction {
  if (input.hasPublisher) return "healthy";

  // Right after go-live the publisher may not have attached yet — give it room.
  if (input.msSinceStreamStart < STUCK_LIVE_GRACE_MS) return "wait";

  if (input.msSincePublisherAbsent >= STUCK_LIVE_AUTO_END_MS) return "auto_end";
  if (input.msSincePublisherAbsent >= STUCK_LIVE_WARN_MS) return "warn_rejoin";
  return "wait";
}
