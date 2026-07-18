import { describe, expect, it } from "vitest";
import {
  COMPOSITION_WARMUP_MS,
  decideCompositionHealAction,
  type CompositionHealInput,
} from "./live-composition-heal";

const base: CompositionHealInput = {
  hasComposition: true,
  compositionState: null,
  destinationState: null,
  channelHealth: "offline",
  msSinceStreamStart: COMPOSITION_WARMUP_MS + 5_000,
};

describe("decideCompositionHealAction", () => {
  it("starts a composition when none exists", () => {
    expect(decideCompositionHealAction({ ...base, hasComposition: false })).toBe("start");
  });

  it("skips a warming composition (STARTING) so it is never thrashed", () => {
    expect(
      decideCompositionHealAction({ ...base, compositionState: "STARTING", msSinceStreamStart: 2_000 }),
    ).toBe("skip");
  });

  it("skips an ACTIVE composition even if the channel read lags as offline", () => {
    expect(decideCompositionHealAction({ ...base, compositionState: "ACTIVE" })).toBe("skip");
  });

  it("skips when the channel destination is RECONNECTING", () => {
    expect(decideCompositionHealAction({ ...base, destinationState: "RECONNECTING" })).toBe("skip");
  });

  it("skips a composition that is STOPPING", () => {
    expect(decideCompositionHealAction({ ...base, compositionState: "STOPPING" })).toBe("skip");
  });

  it("skips when channel HLS is already live/connecting", () => {
    expect(decideCompositionHealAction({ ...base, channelHealth: "live" })).toBe("skip");
    expect(decideCompositionHealAction({ ...base, channelHealth: "connecting" })).toBe("skip");
  });

  it("waits out the warmup window before touching a slow composition", () => {
    expect(
      decideCompositionHealAction({
        ...base,
        compositionState: null,
        msSinceStreamStart: COMPOSITION_WARMUP_MS - 1,
      }),
    ).toBe("skip");
  });

  it("replaces a FAILED composition past warmup with the channel offline", () => {
    expect(decideCompositionHealAction({ ...base, compositionState: "FAILED" })).toBe("replace");
  });

  it("replaces a STOPPED composition past warmup with the channel offline", () => {
    expect(decideCompositionHealAction({ ...base, compositionState: "STOPPED" })).toBe("replace");
  });

  it("replaces when composition state is unknown but warmup elapsed and channel is offline", () => {
    expect(decideCompositionHealAction(base)).toBe("replace");
  });
});
