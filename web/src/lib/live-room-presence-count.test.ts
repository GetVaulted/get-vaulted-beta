import { describe, expect, it } from "vitest";
import { countRoomPresenceViewers, parseRoomPresenceUsers } from "./live-room-presence-count";

describe("countRoomPresenceViewers", () => {
  it("counts unique viewers", () => {
    expect(countRoomPresenceViewers({})).toBe(0);
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ tabKey: "a" }],
        "slot-b": [{ tabKey: "b" }],
      }),
    ).toBe(2);
  });

  it("dedupes the same signed-in user across tabs", () => {
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ userId: "user-1", tabKey: "room-1:tab-a" }],
        "slot-b": [{ userId: "user-1", tabKey: "room-1:tab-b" }],
      }),
    ).toBe(1);
  });

  it("ignores empty presence slots", () => {
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ userId: "user-1", tabKey: "room-1:tab-a" }],
        stale: [],
      }),
    ).toBe(1);
  });
});

describe("parseRoomPresenceUsers", () => {
  it("parses usernames from presence payloads", () => {
    expect(
      parseRoomPresenceUsers({
        guest: [{ username: "@viewer", tabKey: "g1" }],
      }),
    ).toEqual([{ userId: null, username: "viewer", tabKey: "g1" }]);
  });
});
