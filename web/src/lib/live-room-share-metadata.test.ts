import { describe, expect, it } from "vitest";
import {
  buildLiveRoomShareMetadata,
  buildLiveRoomShareTitle,
  canonicalLiveRoomUrl,
  formatLiveRoomCategoryDisplayName,
  resolveLiveRoomShareImageUrl,
} from "./live-room-share-metadata";

describe("live-room-share-metadata", () => {
  it("formats share title with host, category, and show name", () => {
    expect(
      buildLiveRoomShareTitle({
        id: "room1",
        title: "Friday Night Break",
        category: "Trading Cards",
        sellerUsername: "vaultking",
      }),
    ).toBe("vaultking is live · Trading Cards · Friday Night Break");
  });

  it("resolves relative thumbnails against the site base", () => {
    const image = resolveLiveRoomShareImageUrl(
      "/uploads/listings/abc.jpg",
      "https://beta.shopgetvaulted.com",
    );
    expect(image).toBe("https://beta.shopgetvaulted.com/uploads/listings/abc.jpg");
  });

  it("falls back to the default live preview image", () => {
    const image = resolveLiveRoomShareImageUrl("", "https://beta.shopgetvaulted.com");
    expect(image).toMatch(/^https:\/\//);
    expect(image).toContain("unsplash.com");
  });

  it("builds canonical public room URLs", () => {
    expect(canonicalLiveRoomUrl("abc 123", "https://beta.shopgetvaulted.com")).toBe(
      "https://beta.shopgetvaulted.com/live/abc%20123",
    );
  });

  it("normalizes category labels", () => {
    expect(formatLiveRoomCategoryDisplayName("trading_cards")).toBe("Trading Cards");
    expect(formatLiveRoomCategoryDisplayName("Memorabilia")).toBe("Memorabilia");
  });

  it("returns full metadata payload for share-meta API", () => {
    const meta = buildLiveRoomShareMetadata({
      id: "room1",
      title: "Vault Drop",
      category: "Sneakers",
      sellerUsername: "seller1",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    });
    expect(meta.title).toContain("seller1 is live");
    expect(meta.description).toContain("Get Vaulted");
    expect(meta.image).toBe("https://cdn.example.com/thumb.jpg");
    expect(meta.url).toContain("/live/room1");
  });
});
