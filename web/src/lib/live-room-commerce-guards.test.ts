import { describe, expect, it } from "vitest";
import {
  LIVE_HOST_SELF_COMMERCE_ERROR,
  LIVE_MODERATOR_COMMERCE_ERROR,
} from "@/lib/live-room-commerce-guards";

describe("live-room-commerce-guards", () => {
  it("exports stable error copy for host and moderator blocks", () => {
    expect(LIVE_HOST_SELF_COMMERCE_ERROR).toContain("own live room");
    expect(LIVE_MODERATOR_COMMERCE_ERROR).toContain("Moderators");
  });
});
