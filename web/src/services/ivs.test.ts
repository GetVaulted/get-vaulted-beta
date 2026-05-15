import { describe, expect, it } from "vitest";
import { createChannel, mapIvsStatusToRoomHealth, normalizeExternalIvsStateToken } from "@/services/ivs";

describe("ivs service", () => {
  it("maps stream states to room health", () => {
    expect(mapIvsStatusToRoomHealth("LIVE")).toBe("live");
    expect(mapIvsStatusToRoomHealth("OFFLINE")).toBe("offline");
    expect(mapIvsStatusToRoomHealth("CONNECTING")).toBe("connecting");
    expect(mapIvsStatusToRoomHealth("ENDED")).toBe("ended");
    expect(mapIvsStatusToRoomHealth("UNKNOWN")).toBe("error");
  });

  it("normalizes external / EventBridge-style state tokens", () => {
    expect(normalizeExternalIvsStateToken("stream-live")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("PENDING")).toBe("CONNECTING");
    expect(normalizeExternalIvsStateToken("ACTIVE")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("BROADCASTING")).toBe("LIVE");
    expect(normalizeExternalIvsStateToken("idle")).toBe("OFFLINE");
    expect(normalizeExternalIvsStateToken("stream-error")).toBe("UNKNOWN");
    expect(mapIvsStatusToRoomHealth(normalizeExternalIvsStateToken("STARTING"))).toBe("connecting");
  });

  it("returns clean error when AWS env is missing", async () => {
    const oldRegion = process.env.AWS_REGION;
    const oldAccess = process.env.AWS_ACCESS_KEY_ID;
    const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    await expect(createChannel("room_1")).rejects.toThrow(
      "AWS IVS is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.",
    );

    process.env.AWS_REGION = oldRegion;
    process.env.AWS_ACCESS_KEY_ID = oldAccess;
    process.env.AWS_SECRET_ACCESS_KEY = oldSecret;
  });
});
