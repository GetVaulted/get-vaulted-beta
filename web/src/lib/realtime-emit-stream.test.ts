import { beforeEach, describe, expect, it, vi } from "vitest";

const broadcast = vi.fn();

vi.mock("@/lib/supabase-realtime-broadcast", () => ({
  broadcastRealtimeEvent: (...args: unknown[]) => broadcast(...args),
}));

import { emitStreamStatusChanged } from "@/lib/realtime-emit-server";

describe("emitStreamStatusChanged", () => {
  beforeEach(() => {
    broadcast.mockClear();
  });

  it("broadcasts stream_status with buyer-safe fields only", () => {
    emitStreamStatusChanged("room_abc", {
      streamHealth: "offline",
      roomVersion: 4,
      lastStatusSyncAt: "2026-01-02T00:00:00.000Z",
    });
    const streamCalls = broadcast.mock.calls.filter((c) => c[1] === "stream_status");
    expect(streamCalls.length).toBe(1);
    const payload = streamCalls[0][2] as Record<string, unknown>;
    expect(payload.streamHealth).toBe("offline");
    expect(payload.roomVersion).toBe(4);
    const blob = JSON.stringify(payload);
    expect(blob.toLowerCase()).not.toContain("streamkey");
    expect(blob).not.toContain("arn:aws");
  });
});
