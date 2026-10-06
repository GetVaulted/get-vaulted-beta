import { describe, expect, it } from "vitest";
import {
  appendLiveRoomMessageDedupe,
  mergeLiveRoomMessagesById,
} from "@/lib/realtime-merge-messages";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";

function msg(overrides: Partial<LiveRoomMessageDTO> & { id: string }): LiveRoomMessageDTO {
  return {
    liveRoomId: "room_1",
    senderId: "user_1",
    senderUsername: "buyer",
    senderAvatarUrl: null,
    body: "hello",
    messageType: "chat",
    createdAt: "2026-07-17T12:00:00.000Z",
    mentions: [],
    ...overrides,
  };
}

describe("appendLiveRoomMessageDedupe", () => {
  it("replaces the optimistic pending row when the real message arrives (no self-duplicate)", () => {
    const pending = msg({ id: "pending:1721217600000", body: "gm everyone" });
    const withPending = appendLiveRoomMessageDedupe([], pending);
    expect(withPending).toHaveLength(1);

    const server = msg({ id: "clr_realcuid", body: "gm everyone" });
    const reconciled = appendLiveRoomMessageDedupe(withPending, server);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].id).toBe("clr_realcuid");
  });

  it("does not strip a pending row from a different sender / body", () => {
    const pending = msg({ id: "pending:1", senderId: "user_1", body: "mine" });
    const withPending = appendLiveRoomMessageDedupe([], pending);
    const other = msg({ id: "clr_other", senderId: "user_2", body: "theirs" });
    const merged = appendLiveRoomMessageDedupe(withPending, other);
    expect(merged.map((m) => m.id).sort()).toEqual(["clr_other", "pending:1"]);
  });

  it("is idempotent on the same id", () => {
    const a = msg({ id: "clr_a" });
    const once = appendLiveRoomMessageDedupe([], a);
    const twice = appendLiveRoomMessageDedupe(once, a);
    expect(twice).toHaveLength(1);
  });
});

describe("chat ordering", () => {
  it("orders same-timestamp messages deterministically by id (cross-device stable)", () => {
    const ts = "2026-07-17T12:00:00.000Z";
    const a = msg({ id: "clr_aaa", body: "a", createdAt: ts });
    const b = msg({ id: "clr_bbb", body: "b", createdAt: ts });

    const forward = mergeLiveRoomMessagesById([], [a, b]);
    const reversed = mergeLiveRoomMessagesById([], [b, a]);

    expect(forward.map((m) => m.id)).toEqual(["clr_aaa", "clr_bbb"]);
    expect(reversed.map((m) => m.id)).toEqual(forward.map((m) => m.id));
  });

  it("orders by createdAt first", () => {
    const older = msg({ id: "clr_z", body: "older", createdAt: "2026-07-17T12:00:00.000Z" });
    const newer = msg({ id: "clr_a", body: "newer", createdAt: "2026-07-17T12:00:05.000Z" });
    const merged = mergeLiveRoomMessagesById([newer], [older]);
    expect(merged.map((m) => m.id)).toEqual(["clr_z", "clr_a"]);
  });
});

describe("mergeLiveRoomMessagesById", () => {
  it("reconciles pending rows against a bulk API/poll merge", () => {
    const pending = msg({ id: "pending:1", body: "poll test" });
    const server = msg({ id: "clr_real", body: "poll test" });
    const merged = mergeLiveRoomMessagesById([pending], [server]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("clr_real");
  });
});
