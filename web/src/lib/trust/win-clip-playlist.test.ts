import { describe, expect, it } from "vitest";
import {
  buildClipPlaylist,
  channelS3Base,
  parseMediaPlaylist,
  recordingDayPrefixes,
  selectClipSegments,
  signWinClipToken,
  verifyWinClipToken,
} from "./win-clip-playlist";

const PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:11",
  "#EXT-X-PROGRAM-DATE-TIME:2026-10-21T21:08:28.072Z",
  "#EXTINF:10.267,",
  "0.ts",
  "#EXT-X-PROGRAM-DATE-TIME:2026-10-21T21:08:38.339Z",
  "#EXTINF:10.000,",
  "1.ts",
  "#EXT-X-PROGRAM-DATE-TIME:2026-10-21T21:08:48.339Z",
  "#EXTINF:10.100,",
  "2.ts",
  "#EXT-X-PROGRAM-DATE-TIME:2026-10-21T21:08:58.439Z",
  "#EXTINF:10.000,",
  "3.ts",
  "#EXT-X-PROGRAM-DATE-TIME:2026-10-21T21:09:08.439Z",
  "#EXTINF:3.868,",
  "4.ts",
  "#EXT-X-ENDLIST",
].join("\n");

describe("win-clip-playlist", () => {
  it("parses segments with wall-clock start times", () => {
    const segs = parseMediaPlaylist(PLAYLIST);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toMatchObject({ uri: "0.ts", startMs: Date.parse("2026-10-21T21:08:28.072Z") });
    expect(segs[4]!.durationSec).toBeCloseTo(3.868);
  });

  it("selects segments around the purchase moment", () => {
    const segs = parseMediaPlaylist(PLAYLIST);
    const moment = Date.parse("2026-10-21T21:08:55Z");
    const sel = selectClipSegments(segs, moment, { preSeconds: 12, postSeconds: 5 });
    expect(sel).not.toBeNull();
    expect(sel!.segments.map((s) => s.uri)).toEqual(["1.ts", "2.ts", "3.ts"]);
    expect(sel!.momentOffsetSec).toBeGreaterThan(10);
    expect(sel!.durationSec).toBeGreaterThan(25);
  });

  it("clamps at the start and end of the recording", () => {
    const segs = parseMediaPlaylist(PLAYLIST);
    const early = selectClipSegments(segs, Date.parse("2026-10-21T21:08:30Z"));
    expect(early!.segments[0]!.uri).toBe("0.ts");
    const late = selectClipSegments(segs, Date.parse("2026-10-21T21:09:10Z"));
    expect(late!.segments.at(-1)!.uri).toBe("4.ts");
  });

  it("returns null when the moment is outside the recording", () => {
    const segs = parseMediaPlaylist(PLAYLIST);
    expect(selectClipSegments(segs, Date.parse("2026-10-21T20:00:00Z"))).toBeNull();
    expect(selectClipSegments(segs, Date.parse("2026-10-22T20:00:00Z"))).toBeNull();
    expect(selectClipSegments([], Date.now())).toBeNull();
  });

  it("builds a VOD playlist with resolved segment urls", () => {
    const segs = parseMediaPlaylist(PLAYLIST).slice(1, 3);
    const text = buildClipPlaylist(segs, (u) => `https://s3.example/${u}?sig=1`);
    expect(text).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(text).toContain("https://s3.example/1.ts?sig=1");
    expect(text).toContain("#EXT-X-TARGETDURATION:11");
    expect(text.trim().endsWith("#EXT-X-ENDLIST")).toBe(true);
  });

  it("derives the recording prefix from a channel ARN and day folders without padding", () => {
    expect(channelS3Base("arn:aws:ivs:us-east-1:758530011537:channel/N4zrhkQCzpwa")).toBe(
      "ivs/v1/758530011537/N4zrhkQCzpwa",
    );
    expect(channelS3Base("nope")).toBeNull();
    const days = recordingDayPrefixes("ivs/v1/1/abc", Date.parse("2026-10-02T05:00:00Z"), 1);
    expect(days).toEqual(["ivs/v1/1/abc/2026/10/2/", "ivs/v1/1/abc/2026/10/1/"]);
  });

  it("signs and verifies tokens, rejecting tampering and expiry", () => {
    const now = 1_000_000;
    const t = signWinClipToken({ k: "spot", id: "p1", u: "u1", exp: now + 1000 }, "secret");
    expect(verifyWinClipToken(t, "secret", now)).toMatchObject({ k: "spot", id: "p1", u: "u1" });
    expect(verifyWinClipToken(t, "other", now)).toBeNull();
    expect(verifyWinClipToken(`${t}x`, "secret", now)).toBeNull();
    expect(verifyWinClipToken(t, "secret", now + 5000)).toBeNull();
  });
});
