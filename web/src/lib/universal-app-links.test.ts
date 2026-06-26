import { describe, expect, it } from "vitest";
import { iosAppStoreId, iosAppStoreUrl } from "./app-store-links";
import { liveRoomCustomSchemeUrl, appleAppSiteAssociationDocument } from "./universal-app-links";

describe("iosAppStoreUrl", () => {
  it("defaults to the production App Store listing", () => {
    expect(iosAppStoreId()).toBe("6780714456");
    expect(iosAppStoreUrl()).toBe("https://apps.apple.com/app/id6780714456");
  });
});

describe("liveRoomCustomSchemeUrl", () => {
  it("builds a getvaulted scheme deep link", () => {
    expect(liveRoomCustomSchemeUrl("room-1")).toBe("getvaulted://live/room-1");
  });
});

describe("appleAppSiteAssociationDocument", () => {
  it("includes live room paths for the iOS app id", () => {
    const doc = appleAppSiteAssociationDocument();
    const details = (doc.applinks as { details: { appIDs: string[]; paths: string[] }[] }).details;
    expect(details[0]?.appIDs).toContain("6BJ9R4C598.com.getvaulted.app");
    expect(details[0]?.paths).toContain("/live/*");
  });
});
