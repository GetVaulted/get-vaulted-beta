import { describe, expect, it } from "vitest";
import { countRoomPresenceViewers, parseRoomPresenceUsers, PRESENCE_STALE_MS } from "./live-room-presence-count";

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

  it("drops a ghost entry whose last heartbeat is past the staleness window", () => {
    const now = Date.parse("2026-09-17T02:00:00.000Z");
    expect(
      countRoomPresenceViewers(
        {
          fresh: [{ tabKey: "room-1:live", at: new Date(now - 5_000).toISOString() }],
          ghost: [{ tabKey: "room-1:ghost", at: new Date(now - PRESENCE_STALE_MS - 1_000).toISOString() }],
        },
        now,
      ),
    ).toBe(1);
  });

  it("still counts an entry exactly at the staleness boundary", () => {
    const now = Date.parse("2026-09-17T02:00:00.000Z");
    expect(
      countRoomPresenceViewers(
        {
          edge: [{ tabKey: "room-1:edge", at: new Date(now - PRESENCE_STALE_MS).toISOString() }],
        },
        now,
      ),
    ).toBe(1);
  });

  it("does not penalize an entry with no `at` timestamp at all", () => {
    expect(
      countRoomPresenceViewers({
        "slot-a": [{ tabKey: "room-1:no-timestamp" }],
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

  it("drops a ghost from the roster once it's past the staleness window", () => {
    const now = Date.parse("2026-09-17T02:00:00.000Z");
    expect(
      parseRoomPresenceUsers(
        {
          guest: [{ username: "@viewer", tabKey: "g1", at: new Date(now - 5_000).toISOString() }],
          ghost: [
            { username: "@gone", tabKey: "g2", at: new Date(now - PRESENCE_STALE_MS - 1_000).toISOString() },
          ],
        },
        now,
      ),
    ).toEqual([{ userId: null, username: "viewer", tabKey: "g1" }]);
  });
});
