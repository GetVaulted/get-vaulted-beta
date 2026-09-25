import { describe, expect, it } from "vitest";
import {
  parseAppPresencePlatform,
  shouldSkipPresenceWrite,
  summarizeOnlinePresence,
} from "./app-presence";

describe("app-presence", () => {
  it("parses platform ids", () => {
    expect(parseAppPresencePlatform("ios")).toBe("ios");
    expect(parseAppPresencePlatform("android")).toBe("android");
    expect(parseAppPresencePlatform("web")).toBe("web");
    expect(parseAppPresencePlatform("desktop")).toBeNull();
    expect(parseAppPresencePlatform(null)).toBeNull();
  });

  it("throttles writes within the window", () => {
    const now = new Date("2026-07-26T12:00:20.000Z");
    expect(shouldSkipPresenceWrite(new Date("2026-07-26T12:00:05.000Z"), now)).toBe(true);
    expect(shouldSkipPresenceWrite(new Date("2026-07-26T11:59:50.000Z"), now)).toBe(false);
    expect(shouldSkipPresenceWrite(null, now)).toBe(false);
  });

  it("counts distinct users and platform buckets", () => {
    const summary = summarizeOnlinePresence([
      { userId: "u1", platform: "ios" },
      { userId: "u1", platform: "web" },
      { userId: "u2", platform: "android" },
      { userId: "u3", platform: "web" },
    ]);
    expect(summary.onlineNow).toBe(3);
    expect(summary.onlineByPlatform).toEqual({ ios: 1, android: 1, web: 2 });
  });
});
