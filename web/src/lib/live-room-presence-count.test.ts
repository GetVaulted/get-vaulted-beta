import { describe, expect, it } from "vitest";
import { countRoomPresenceViewers } from "./live-room-presence-count";

describe("countRoomPresenceViewers", () => {
  it("counts distinct presence keys", () => {
    expect(countRoomPresenceViewers({})).toBe(0);
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ tabKey: "a" }],
        "slot-b": [{ tabKey: "b" }],
      }),
    ).toBe(2);
  });
});
