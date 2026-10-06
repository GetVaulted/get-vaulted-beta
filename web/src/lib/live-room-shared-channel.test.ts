import { describe, expect, it } from "vitest";
import { buildPresenceChannelKey, resolvePresenceSlotSync } from "@/lib/live-room-presence-key";
import {
  bindLiveRoomPresenceHandlers,
  peekLiveRoomChannel,
  releaseLiveRoomChannel,
  resetLiveRoomSharedChannelsForTests,
  retainLiveRoomChannel,
  subscribeLiveRoomChannel,
} from "@/lib/live-room-shared-channel";
import { roomChannel } from "@/lib/realtime-channels";

describe("liveRoomSharedChannel", () => {
  it("shares one channel per room and ref-counts retain/release", () => {
    resetLiveRoomSharedChannelsForTests();
    const supabase = {
      channel: (name: string, opts: unknown) => ({
        name,
        opts,
        on() {
          return this;
        },
        subscribe: () => {},
        presenceState: () => ({}),
      }),
      removeChannel: () => {},
    } as never;

    const a = retainLiveRoomChannel(supabase, "room-1", "viewer-a");
    const b = retainLiveRoomChannel(supabase, "room-1", "viewer-b");
    expect(a).toBe(b);
    expect(peekLiveRoomChannel("room-1")).toBe(a);

    releaseLiveRoomChannel(supabase, "room-1");
    expect(peekLiveRoomChannel("room-1")).toBe(a);

    releaseLiveRoomChannel(supabase, "room-1");
    expect(peekLiveRoomChannel("room-1")).toBeNull();
  });

  it("subscribes once and replays last status to late listeners", async () => {
    resetLiveRoomSharedChannelsForTests();
    const statuses: string[] = [];
    const supabase = {
      channel: (_name: string, _opts: unknown) => ({
        on() {
          return this;
        },
        subscribe: (cb: (status: string) => void) => {
          cb("SUBSCRIBED");
          return {};
        },
        presenceState: () => ({}),
      }),
      removeChannel: () => {},
    } as never;

    retainLiveRoomChannel(supabase, "room-2", "viewer-a");
    subscribeLiveRoomChannel("room-2", (status) => {
      statuses.push(`first:${status}`);
    });
    subscribeLiveRoomChannel("room-2", (status) => {
      statuses.push(`second:${status}`);
    });

    // subscribe() is deferred to a microtask so sibling hooks can attach .on() first
    await Promise.resolve();

    expect(statuses).toEqual(["first:SUBSCRIBED", "second:SUBSCRIBED"]);
  });

  it("wires presence multiplexers at channel create before subscribe", async () => {
    resetLiveRoomSharedChannelsForTests();
    const order: string[] = [];
    let subscribed = false;
    const supabase = {
      channel: (_name: string, _opts: unknown) => ({
        on(type: string) {
          if (subscribed && type === "presence") {
            throw new Error(`cannot add 'presence' callbacks after 'subscribe()'.`);
          }
          order.push(`on:${type}`);
          return this;
        },
        subscribe: (cb: (status: string) => void) => {
          subscribed = true;
          order.push("subscribe");
          cb("SUBSCRIBED");
          return {};
        },
        presenceState: () => ({}),
      }),
      removeChannel: () => {},
    } as never;

    // First retainer (e.g. moderation) creates the channel — presence bindings happen here.
    retainLiveRoomChannel(supabase, "room-3", "observer");
    subscribeLiveRoomChannel("room-3", () => {});
    // Late presence hook after subscribe is scheduled — must not call channel.on("presence") again.
    const syncCalls: number[] = [];
    bindLiveRoomPresenceHandlers("room-3", { onSync: () => syncCalls.push(1) });
    await Promise.resolve();

    expect(order.filter((x) => x.startsWith("on:presence")).length).toBe(3);
    expect(order).toContain("subscribe");
    expect(subscribed).toBe(true);
  });

  it("uses room topic names aligned with mobile", () => {
    expect(roomChannel("abc")).toBe("gv-room-abc");
  });
});

describe("liveRoomPresenceKey", () => {
  it("builds stable viewer keys per user", () => {
    const key1 = buildPresenceChannelKey("room-1", "user-1", true);
    const key2 = buildPresenceChannelKey("room-1", "user-1", true);
    expect(key1).toBe(key2);
    expect(key1.startsWith("room-1:")).toBe(true);
  });

  it("uses observer keys for host-only listeners", () => {
    const key = buildPresenceChannelKey("room-1", "host-1", false);
    expect(key.startsWith("observer:room-1:")).toBe(true);
  });

  it("reuses in-memory presence slots", () => {
    const slotA = resolvePresenceSlotSync("user-a");
    const slotB = resolvePresenceSlotSync("user-a");
    expect(slotA).toBe(slotB);
  });
});
