/**
 * Pure decision logic for healing the Stage→HLS mirror composition WITHOUT thrashing.
 *
 * Background: a freshly started composition takes ~15–30s before its channel destination reports
 * LIVE. The buyer stream poll runs a heal every ~30s. The old heal replaced the composition any
 * time the channel wasn't already live — so a still-warming composition kept getting torn down and
 * restarted, and the HLS mirror could never come up (even with a perfectly healthy host publishing).
 *
 * This helper decides whether to leave the current composition alone, start a first one, or replace
 * a confirmed-dead one. It only replaces when AWS reports the composition/destination is actually
 * dead AND we're past the warmup window AND the channel HLS is still offline.
 */

/** How long after go-live a composition/channel is allowed to warm up before we treat it as dead. */
export const COMPOSITION_WARMUP_MS = 30_000;

export type CompositionHealAction = "skip" | "start" | "replace";

export type CompositionHealInput = {
  /** Does the room currently have a composition ARN recorded? */
  hasComposition: boolean;
  /** AWS `Composition.state` (e.g. STARTING | ACTIVE | STOPPING | STOPPED | FAILED), or null if unknown/not found. */
  compositionState: string | null;
  /** AWS channel `Destination.state` (STARTING | ACTIVE | RECONNECTING | STOPPING | FAILED), or null. */
  destinationState: string | null;
  /** Channel HLS health from GetStream (live | connecting | offline | ...), or null if unknown. */
  channelHealth: string | null;
  /** ms since the host went live (now - streamStartedAt). Use a large number when unknown. */
  msSinceStreamStart: number;
};

const ALIVE_COMPOSITION_STATES = new Set(["STARTING", "ACTIVE"]);
const ALIVE_DESTINATION_STATES = new Set(["STARTING", "ACTIVE", "RECONNECTING"]);

/**
 * Decide what to do with the room's HLS mirror composition.
 * - "start": no composition exists yet → start one.
 * - "skip": the composition is up, warming, or shutting down → leave it alone (anti-thrash).
 * - "replace": the composition is confirmed dead and the channel is offline past warmup → recycle it.
 */
export function decideCompositionHealAction(input: CompositionHealInput): CompositionHealAction {
  if (!input.hasComposition) return "start";

  const comp = (input.compositionState ?? "").toUpperCase();
  const dest = (input.destinationState ?? "").toUpperCase();
  const channel = (input.channelHealth ?? "").toLowerCase();

  // Composition is actively shutting down — don't fight it; the next pass will restart if needed.
  if (comp === "STOPPING") return "skip";

  // Composition itself is up or coming up — never thrash it.
  if (ALIVE_COMPOSITION_STATES.has(comp)) return "skip";

  // The channel destination is up, coming up, or auto-reconnecting — leave it.
  if (ALIVE_DESTINATION_STATES.has(dest)) return "skip";

  // Channel HLS is already flowing — nothing to do.
  if (channel === "live" || channel === "connecting") return "skip";

  // Inside the warmup window we can't distinguish "slow to warm" from "dead" — wait it out.
  if (input.msSinceStreamStart < COMPOSITION_WARMUP_MS) return "skip";

  // Composition FAILED/STOPPED (or unknown) past warmup and channel still offline → recycle it.
  return "replace";
}
