import { describe, expect, it } from "vitest";
import {
  LIVE_INVENTORY_PHOTOS,
  MARKETPLACE_MAX_PHOTOS,
  MARKETPLACE_MIN_PHOTOS,
  validateListingImageCount,
  validateLiveRoomItemThumbnail,
} from "./listing-photo-requirements";

describe("listing-photo-requirements", () => {
  it("requires exactly one image for live show inventory drafts", () => {
    expect(
      validateListingImageCount({ buyingFormat: "auction", status: "draft", imageCount: 0 }).ok,
    ).toBe(false);
    expect(
      validateListingImageCount({ buyingFormat: "auction", status: "draft", imageCount: 1 }).ok,
    ).toBe(true);
    expect(
      validateListingImageCount({ buyingFormat: "auction", status: "draft", imageCount: 2 }).ok,
    ).toBe(false);
    expect(LIVE_INVENTORY_PHOTOS).toBe(1);
  });

  it("requires 3–10 photos for active marketplace buy-now listings", () => {
    expect(
      validateListingImageCount({ buyingFormat: "buy_now", status: "active", imageCount: 2 }).ok,
    ).toBe(false);
    expect(
      validateListingImageCount({ buyingFormat: "buy_now", status: "active", imageCount: 3 }).ok,
    ).toBe(true);
    expect(
      validateListingImageCount({ buyingFormat: "buy_now", status: "active", imageCount: 10 }).ok,
    ).toBe(true);
    expect(
      validateListingImageCount({ buyingFormat: "buy_now", status: "active", imageCount: 11 }).ok,
    ).toBe(false);
    expect(MARKETPLACE_MIN_PHOTOS).toBe(3);
    expect(MARKETPLACE_MAX_PHOTOS).toBe(10);
  });

  it("requires thumbnail on live room queue items", () => {
    expect(validateLiveRoomItemThumbnail("").ok).toBe(false);
    expect(validateLiveRoomItemThumbnail("https://cdn.test/thumb.jpg").ok).toBe(true);
  });
});
