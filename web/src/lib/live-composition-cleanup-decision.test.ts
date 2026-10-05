import { describe, expect, it } from "vitest";
import {
  COMPOSITION_HARD_CAP_MS,
  COMPOSITION_IDLE_STOP_MS,
  ENDED_ROOM_GRACE_MS,
  NO_ROOM_RECORD_GRACE_MS,
  decideOrphanCompositionStop,
  type CompositionCleanupInput,
} from "./live-composition-cleanup-decision";

const NOW = 1_800_000_000_000;
const base: CompositionCleanupInput = {
  ageMs: 60 * 60_000,
  nowMs: NOW,
  hasActiveSession: true,
  idleForMs: null,
  rooms: [{ status: "live", endedAtMs: null }],
};

describe("decideOrphanCompositionStop", () => {
  it("never stops a live show that still has an active session, however old", () => {
    const d = decideOrphanCompositionStop({ ...base, ageMs: COMPOSITION_HARD_CAP_MS * 3 });
    expect(d.stop).toBe(false);
  });

  it("stops a live-room composition once its stage has been idle long enough", () => {
    const d = decideOrphanCompositionStop({
      ...base,
      hasActiveSession: false,
      idleForMs: COMPOSITION_IDLE_STOP_MS,
    });
    expect(d).toEqual({ stop: true, reason: "idle_stage" });
  });

  it("stops a composition for an ended room even though the stage still has an active session", () => {
    const d = decideOrphanCompositionStop({
      ...base,
      hasActiveSession: true,
      rooms: [{ status: "ended", endedAtMs: NOW - ENDED_ROOM_GRACE_MS - 1 }],
    });
    expect(d).toEqual({ stop: true, reason: "room_ended" });
  });

  it("waits out the grace window right after a room ends", () => {
    const d = decideOrphanCompositionStop({
      ...base,
      rooms: [{ status: "ended", endedAtMs: NOW - 30_000 }],
    });
    expect(d).toEqual({ stop: false, reason: "keep_ended_grace" });
  });

  it("stops when every referencing room ended, even with a null endedAt", () => {
    const d = decideOrphanCompositionStop({ ...base, rooms: [{ status: "ended", endedAtMs: null }] });
    expect(d.stop).toBe(true);
  });

  it("does not stop when one of the referencing rooms is still live", () => {
    const d = decideOrphanCompositionStop({
      ...base,
      rooms: [
        { status: "ended", endedAtMs: NOW - 60 * 60_000 },
        { status: "live", endedAtMs: null },
      ],
    });
    expect(d.stop).toBe(false);
  });

  it("leaves a brand-new composition with no room record alone", () => {
    const d = decideOrphanCompositionStop({ ...base, ageMs: 60_000, rooms: [] });
    expect(d).toEqual({ stop: false, reason: "keep_young" });
  });

  it("stops an old composition that no room points at, even with an active session", () => {
    const d = decideOrphanCompositionStop({ ...base, ageMs: NO_ROOM_RECORD_GRACE_MS, rooms: [] });
    expect(d).toEqual({ stop: true, reason: "no_room_record" });
  });

  it("falls back to the conservative rules for a scheduled (not live, not ended) room", () => {
    const d = decideOrphanCompositionStop({ ...base, rooms: [{ status: "scheduled", endedAtMs: null }] });
    expect(d.stop).toBe(false);
  });
});
