import { describe, expect, it } from "vitest";
import { isPublicDiscoveryLiveRoom } from "./live-room-public-discovery";

describe("isPublicDiscoveryLiveRoom", () => {
  it("includes live rooms", () => {
    expect(isPublicDiscoveryLiveRoom({ status: "live" })).toBe(true);
  });

  it("includes scheduled rooms with a start time", () => {
    expect(
      isPublicDiscoveryLiveRoom({
        status: "scheduled",
        scheduledStartAt: "2026-06-20T18:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("includes go-live-now scheduled rooms before the host is on air", () => {
    expect(isPublicDiscoveryLiveRoom({ status: "scheduled", scheduledStartAt: null })).toBe(true);
    expect(isPublicDiscoveryLiveRoom({ status: "scheduled" })).toBe(true);
  });

  it("excludes ended rooms", () => {
    expect(isPublicDiscoveryLiveRoom({ status: "ended" })).toBe(false);
  });
});
