import { describe, expect, it } from "vitest";
import {
  buildHitClipShareCaption,
  canonicalHitClipShareUrl,
  validateHitClipDurationMs,
} from "./hit-clip";

describe("hit-clip", () => {
  it("validates duration window for TikTok-length clips", () => {
    expect(validateHitClipDurationMs(1_000).ok).toBe(false);
    expect(validateHitClipDurationMs(2_000).ok).toBe(true);
    expect(validateHitClipDurationMs(15_000).ok).toBe(true);
    expect(validateHitClipDurationMs(16_000).ok).toBe(false);
  });

  it("builds a TikTok-friendly caption with share URL", () => {
    const caption = buildHitClipShareCaption({
      title: "HIT · Bowman Chrome",
      sellerUsername: "dtdt",
      shareUrl: "https://shopgetvaulted.com/hit/abc",
    });
    expect(caption).toContain("HIT 🔥");
    expect(caption).toContain("@dtdt");
    expect(caption).toContain("https://shopgetvaulted.com/hit/abc");
  });

  it("canonicalHitClipShareUrl encodes id", () => {
    expect(canonicalHitClipShareUrl("clip/1")).toContain("/hit/clip%2F1");
  });
});
