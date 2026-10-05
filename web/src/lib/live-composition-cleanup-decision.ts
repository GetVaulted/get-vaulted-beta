/**
 * Pure decision logic for the AWS-first orphaned-composition sweep (see
 * `cleanupOrphanedIvsCompositions` in services/ivs.ts).
 *
 * Why this exists: a StartComposition bills ~$2.30/hr for as long as AWS reports it ACTIVE. The
 * original sweep never stopped a composition while its Stage still reported an active session --
 * even when our own LiveRoom row said the show had ENDED. A host app that kept publishing, or a
 * viewer that stayed subscribed, after "end show" therefore kept the composition (and the bill)
 * running indefinitely. Here, our own record of the show ending wins over the Stage's session
 * state, after a short grace window.
 */

export const COMPOSITION_IDLE_STOP_MS = 10 * 60_000;
export const COMPOSITION_HARD_CAP_MS = 8 * 60 * 60_000;
/** A room that ended this recently may still be mid-teardown -- leave it to the normal path. */
export const ENDED_ROOM_GRACE_MS = 3 * 60_000;
/** A composition no LiveRoom row points at is stopped once it is clearly past any start race. */
export const NO_ROOM_RECORD_GRACE_MS = 15 * 60_000;

export type CompositionRoomRef = {
  status: string;
  endedAtMs: number | null;
};

export type CompositionCleanupInput = {
  ageMs: number;
  nowMs: number;
  /** AWS shows a live session attached to the Stage right now. */
  hasActiveSession: boolean;
  /** ms since the newest Stage session ended; null when none / still open. */
  idleForMs: number | null;
  /** Every LiveRoom row pointing at this composition ARN or its Stage ARN. */
  rooms: CompositionRoomRef[];
};

export type CompositionCleanupDecision = {
  stop: boolean;
  reason:
    | "room_ended"
    | "no_room_record"
    | "idle_stage"
    | "hard_cap_no_active_session"
    | "keep_active_session"
    | "keep_ended_grace"
    | "keep_young"
    | "keep_not_idle";
};

function legacyDecision(input: CompositionCleanupInput): CompositionCleanupDecision {
  // A real, currently-attached session on a live show: never cut it off, whatever its age.
  if (input.hasActiveSession) return { stop: false, reason: "keep_active_session" };
  const idleLongEnough = input.idleForMs === null || input.idleForMs >= COMPOSITION_IDLE_STOP_MS;
  const overHardCap = input.ageMs >= COMPOSITION_HARD_CAP_MS;
  if (idleLongEnough) return { stop: true, reason: "idle_stage" };
  if (overHardCap) return { stop: true, reason: "hard_cap_no_active_session" };
  return { stop: false, reason: "keep_not_idle" };
}

export function decideOrphanCompositionStop(input: CompositionCleanupInput): CompositionCleanupDecision {
  const { rooms } = input;

  // Any room still live on this composition/stage: it is a real show. Original rules only.
  if (rooms.some((r) => r.status === "live")) return legacyDecision(input);

  // No room row at all: an orphan (e.g. DB pointer cleared after a failed stop). Wait out any
  // start/record race, then stop it regardless of Stage session state.
  if (rooms.length === 0) {
    if (input.ageMs >= NO_ROOM_RECORD_GRACE_MS) return { stop: true, reason: "no_room_record" };
    return { stop: false, reason: "keep_young" };
  }

  // Every referencing room has ended: the show is over, so the HLS mirror must stop even if the
  // Stage still has a (zombie) session attached.
  if (rooms.every((r) => r.status === "ended")) {
    const newestEnd = Math.max(...rooms.map((r) => r.endedAtMs ?? 0));
    if (newestEnd > 0 && input.nowMs - newestEnd < ENDED_ROOM_GRACE_MS) {
      return { stop: false, reason: "keep_ended_grace" };
    }
    return { stop: true, reason: "room_ended" };
  }

  // Some other state (e.g. scheduled): fall back to the conservative original rules.
  return legacyDecision(input);
}
