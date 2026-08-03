import { describe, expect, it } from "vitest";
import { isLiveRoomOpenForSpotPurchase } from "@/lib/live-room-commerce-guards";

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
