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

  it("counts the same account on two devices as two viewers (per-connection headcount)", () => {
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ userId: "user-1", tabKey: "room-1:device-a" }],
        "slot-b": [{ userId: "user-1", tabKey: "room-1:device-b" }],
      }),
    ).toBe(2);
  });

  it("collapses duplicate metas that share one connection slot", () => {
    expect(
      countRoomPresenceViewers({
        "slot-a": [
          { userId: "user-1", tabKey: "room-1:device-a" },
          { userId: "user-1", tabKey: "room-1:device-a" },
        ],
      }),
    ).toBe(1);
  });

  it("counts multiple anonymous guests separately", () => {
    expect(
      countRoomPresenceViewers({
        "guest-a": [{ tabKey: "room-1:guest-a" }],
        "guest-b": [{ tabKey: "room-1:guest-b" }],
        "guest-c": [{ tabKey: "room-1:guest-c" }],
      }),
    ).toBe(3);
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
