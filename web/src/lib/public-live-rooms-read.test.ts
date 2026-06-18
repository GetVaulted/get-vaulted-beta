import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  isPublicLiveOgImageRoute,
  isPublicLiveRoomSharePage,
  isPublicLiveRoomsBuyerRead,
} from "./public-live-rooms-read";

function req(method: string, pathname: string, search = ""): NextRequest {
  return new NextRequest(`https://beta.shopgetvaulted.com${pathname}${search}`, { method });
}

describe("isPublicLiveRoomsBuyerRead", () => {
  it("allows public directory GET", () => {
    expect(isPublicLiveRoomsBuyerRead(req("GET", "/api/live-rooms", "?limit=80"))).toBe(true);
  });

  it("blocks seller mine listing without auth path", () => {
    expect(isPublicLiveRoomsBuyerRead(req("GET", "/api/live-rooms", "?mine=1"))).toBe(false);
  });

  it("allows room detail GET", () => {
    expect(isPublicLiveRoomsBuyerRead(req("GET", "/api/live-rooms/room-abc"))).toBe(true);
  });

  it("blocks host subroutes", () => {
    expect(isPublicLiveRoomsBuyerRead(req("GET", "/api/live-rooms/room-abc/host-console"))).toBe(false);
    expect(isPublicLiveRoomsBuyerRead(req("POST", "/api/live-rooms"))).toBe(false);
  });

  it("allows dynamic OG image routes", () => {
    expect(isPublicLiveOgImageRoute("/api/og/live/room-abc")).toBe(true);
    expect(isPublicLiveOgImageRoute("/api/og/live")).toBe(false);
  });

  it("allows single-room share landing pages", () => {
    expect(isPublicLiveRoomSharePage("/live/room-abc")).toBe(true);
    expect(isPublicLiveRoomSharePage("/live")).toBe(false);
  });
});
