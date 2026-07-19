import { describe, expect, it } from "vitest";
import {
  bufferLooksLikeMp4Family,
  parseLiveTeaserFieldsFromBody,
  validateTeaserDurationMs,
} from "@/lib/live-room-teaser";

describe("live-room-teaser", () => {
  it("accepts durations within 1–15 seconds", () => {
    expect(validateTeaserDurationMs(1000).ok).toBe(true);
    expect(validateTeaserDurationMs(15_000).ok).toBe(true);
    expect(validateTeaserDurationMs(15_001).ok).toBe(false);
    expect(validateTeaserDurationMs(500).ok).toBe(false);
  });

  it("detects ftyp-based mp4 containers", () => {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(24, 0);
    buf.write("ftyp", 4, "ascii");
    buf.write("isom", 8, "ascii");
    expect(bufferLooksLikeMp4Family(buf)).toBe(true);
    expect(bufferLooksLikeMp4Family(Buffer.from("not-a-video"))).toBe(false);
  });

  it("parses clear + set teaser fields from body", () => {
    expect(parseLiveTeaserFieldsFromBody({ teaserVideoUrl: "" })).toEqual({
      ok: true,
      data: { teaserVideoUrl: null, teaserVideoDurationMs: null },
    });
    expect(
      parseLiveTeaserFieldsFromBody({
        teaserVideoUrl: "https://cdn.example.com/teaser.mp4",
        teaserVideoDurationMs: 12_000,
      }),
    ).toEqual({
      ok: true,
      data: {
        teaserVideoUrl: "https://cdn.example.com/teaser.mp4",
        teaserVideoDurationMs: 12_000,
      },
    });
    expect(
      parseLiveTeaserFieldsFromBody({
        teaserVideoUrl: "https://cdn.example.com/teaser.mp4",
      }).ok,
    ).toBe(false);
  });
});
