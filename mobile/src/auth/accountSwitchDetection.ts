/**
 * Pure decision helper for detecting a cross-account switch on the SAME app instance (e.g. user A
 * signs out and user B signs in without a force-quit in between).
 *
 * Deliberately ignores any `null`/`undefined` reading in between two signed-in user ids. A
 * transient blip during a warm-resume Supabase token refresh can momentarily report
 * `user === null` before recovering to the SAME user (see `authSessionRoutingDecision.ts`).
 * Comparing only two consecutive *signed-in* ids means that blip is never compared against
 * anything and can't trigger a false-positive reset of in-memory/local state.
 *
 * `lastSignedInUserId` should be `undefined` until the first signed-in user id has ever been
 * observed (cold start / first auth resolution) — that first observation is never itself a
 * "switch", regardless of which user it is.
 */
export function didAccountSwitch(
  lastSignedInUserId: string | null | undefined,
  nextSignedInUserId: string,
): boolean {
  return lastSignedInUserId != null && lastSignedInUserId !== nextSignedInUserId;
}
