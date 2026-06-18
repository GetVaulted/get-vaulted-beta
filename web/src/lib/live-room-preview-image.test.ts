import { describe, expect, it } from "vitest";
import { resolveLiveRoomPreviewImage, resolveLiveRoomMediaUrl } from "./live-room-preview-image";

describe("live-room-preview-image", () => {
  it("resolves relative upload paths", () => {
    expect(resolveLiveRoomMediaUrl("/uploads/listings/a.jpg", "https://beta.shopgetvaulted.com")).toBe(
      "https://beta.shopgetvaulted.com/uploads/listings/a.jpg",
    );
  });

  it("prefers thumbnail over queue image", () => {
    expect(
      resolveLiveRoomPreviewImage(
        {
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          firstItemImageUrl: "https://cdn.example/item.jpg",
          category: "Other",
        },
        "https://beta.shopgetvaulted.com",
      ),
    ).toBe("https://cdn.example/thumb.jpg");
  });
});
