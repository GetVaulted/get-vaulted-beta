import { describe, expect, it } from "vitest";
import {
  isLiveRoomOpenForSpotPurchase,
  isRoomOpenForHostOffPlatformMarkSold,
  isRoomOpenForHostTeamBoardEdit,
} from "@/lib/live-room-commerce-guards";

describe("isLiveRoomOpenForSpotPurchase", () => {
  it("allows scheduled pre-sale and live shows", () => {
    expect(isLiveRoomOpenForSpotPurchase("scheduled")).toBe(true);
    expect(isLiveRoomOpenForSpotPurchase("live")).toBe(true);
    expect(isLiveRoomOpenForSpotPurchase("LIVE")).toBe(true);
  });

  it("blocks ended and unknown rooms", () => {
    expect(isLiveRoomOpenForSpotPurchase("ended")).toBe(false);
    expect(isLiveRoomOpenForSpotPurchase("")).toBe(false);
    expect(isLiveRoomOpenForSpotPurchase(null)).toBe(false);
  });
});

describe("isRoomOpenForHostOffPlatformMarkSold", () => {
  it("allows scheduled (pre-live), live, and ended (post-show settlement)", () => {
    expect(isRoomOpenForHostOffPlatformMarkSold("scheduled")).toBe(true);
    expect(isRoomOpenForHostOffPlatformMarkSold("live")).toBe(true);
    expect(isRoomOpenForHostOffPlatformMarkSold("ended")).toBe(true);
    expect(isRoomOpenForHostOffPlatformMarkSold("ENDED")).toBe(true);
  });

  it("blocks unknown rooms", () => {
    expect(isRoomOpenForHostOffPlatformMarkSold("")).toBe(false);
    expect(isRoomOpenForHostOffPlatformMarkSold(null)).toBe(false);
  });
});

describe("isRoomOpenForHostTeamBoardEdit", () => {
  it("allows live, scheduled, and ended", () => {
    expect(isRoomOpenForHostTeamBoardEdit("live")).toBe(true);
    expect(isRoomOpenForHostTeamBoardEdit("scheduled")).toBe(true);
    expect(isRoomOpenForHostTeamBoardEdit("ended")).toBe(true);
  });

  it("blocks unknown rooms", () => {
    expect(isRoomOpenForHostTeamBoardEdit("")).toBe(false);
    expect(isRoomOpenForHostTeamBoardEdit(null)).toBe(false);
  });
});
