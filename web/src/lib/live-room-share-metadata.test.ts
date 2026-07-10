import { describe, expect, it } from "vitest";
import {
  buildLiveRoomShareMetadata,
  canonicalLiveRoomUrl,
  canonicalShareSiteUrl,
  formatLiveRoomShareDescription,
  formatLiveRoomShareOgTitle,
  formatLiveRoomShareText,
  liveRoomOgImageUrl,
  resolveLiveRoomShareBackgroundUrl,
  resolveLiveRoomShareImageUrl,
} from "./live-room-share-metadata";
import { formatOgViewerLabel } from "./live-room-og-payload";

describe("live-room-share-metadata", () => {
  it("formats scheduled og:title without LIVE wording", () => {
    expect(
      formatLiveRoomShareOgTitle({
        id: "room1",
        title: "Friday Night Break",
        sellerUsername: "vaultking",
        isLive: false,
      }),
    ).toBe("vaultking on Get Vaulted");
  });

  it("formats scheduled og:description", () => {
    expect(
      formatLiveRoomShareDescription({
        title: "Friday Night Break",
        isLive: false,
      }),
    ).toBe("Friday Night Break • Join when we go live");
  });

  it("formats og:title as host is LIVE on Get Vaulted", () => {
    expect(
      formatLiveRoomShareOgTitle({
        id: "room1",
        title: "Friday Night Break",
        sellerUsername: "vaultking",
      }),
    ).toBe("vaultking is LIVE on Get Vaulted");
  });

  it("formats og:description with show title", () => {
    expect(
      formatLiveRoomShareDescription({
        title: "Friday Night Break",
      }),
    ).toBe("Friday Night Break • Join the live auction now");
  });

  it("resolves relative thumbnails against the site base", () => {
    const image = resolveLiveRoomShareImageUrl(
      "/uploads/listings/abc.jpg",
      "https://beta.shopgetvaulted.com",
    );
    expect(image).toBe("https://beta.shopgetvaulted.com/uploads/listings/abc.jpg");
  });

  it("builds canonical public room URLs on shopgetvaulted.com", () => {
    expect(canonicalLiveRoomUrl("abc 123", "https://shopgetvaulted.com")).toBe(
      "https://shopgetvaulted.com/live/abc%20123",
    );
  });

  it("defaults canonical share site to shopgetvaulted.com", () => {
    expect(canonicalShareSiteUrl()).toBe("https://shopgetvaulted.com");
  });

  it("returns full metadata payload with dynamic OG image endpoint", () => {
    const meta = buildLiveRoomShareMetadata({
      id: "room1",
      title: "Vault Drop",
      sellerUsername: "seller1",
    });
    expect(meta.title).toBe("seller1 is LIVE on Get Vaulted");
    expect(meta.description).toBe("Vault Drop • Join the live auction now");
    expect(meta.image).toContain("https://shopgetvaulted.com/api/og/live/room1");
    expect(meta.url).toBe("https://shopgetvaulted.com/live/room1");
  });

  it("defaults og image host to the canonical share site", () => {
    expect(liveRoomOgImageUrl("room1")).toBe("https://shopgetvaulted.com/api/og/live/room1");
  });

  it("share background prefers the uploaded tile over the secondary fallback", () => {
    expect(
      resolveLiveRoomShareBackgroundUrl(
        "/uploads/shows/tile.jpg",
        "https://shopgetvaulted.com",
        "https://cdn.example/host-avatar.jpg",
        "https://cdn.example/branded.jpg",
      ),
    ).toBe("https://shopgetvaulted.com/uploads/shows/tile.jpg");
  });

  it("share background never falls back to the host avatar (avatar is its own OG badge, not the tile)", () => {
    expect(
      resolveLiveRoomShareBackgroundUrl(
        null,
        "https://shopgetvaulted.com",
        null,
        "https://cdn.example/first-item-or-category.jpg",
      ),
    ).toBe("https://cdn.example/first-item-or-category.jpg");
  });

  it("share background falls back to the branded banner when nothing else is available", () => {
    expect(resolveLiveRoomShareBackgroundUrl(null, "https://shopgetvaulted.com", null)).toBe(
      "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=630&q=80&auto=format&fit=crop",
    );
  });

  it("formats native share text with url", () => {
    expect(
      formatLiveRoomShareText({
        hostUsername: "vaultking",
        showTitle: "Friday Night Break",
        url: "https://shopgetvaulted.com/live/room1",
      }),
    ).toBe(
      "vaultking is LIVE on Get Vaulted — Friday Night Break. Join now: https://shopgetvaulted.com/live/room1",
    );
  });

  it("builds og image URL on deployment host when explicitly passed", () => {
    expect(liveRoomOgImageUrl("room1", "https://beta.shopgetvaulted.com")).toBe(
      "https://beta.shopgetvaulted.com/api/og/live/room1",
    );
  });
});

describe("live-room-og-payload helpers", () => {
  it("formats viewer counts for OG cards", () => {
    expect(formatOgViewerLabel(842)).toBe("842 watching");
    expect(formatOgViewerLabel(2400)).toBe("2.4k watching");
    expect(formatOgViewerLabel(0)).toBeNull();
  });
});
