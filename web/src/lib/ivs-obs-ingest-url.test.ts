import { describe, expect, it } from "vitest";
import { formatIvsObsIngestUrl } from "./ivs-obs-ingest-url";

describe("formatIvsObsIngestUrl", () => {
  it("wraps a bare IVS ingest host for OBS Custom server", () => {
    expect(formatIvsObsIngestUrl("d94190052cca.global-contribute.live-video.net")).toBe(
      "rtmps://d94190052cca.global-contribute.live-video.net:443/app/",
    );
  });

  it("is idempotent for an already-formatted OBS URL", () => {
    const full = "rtmps://d94190052cca.global-contribute.live-video.net:443/app/";
    expect(formatIvsObsIngestUrl(full)).toBe(full);
  });

  it("strips https and path junk before wrapping", () => {
    expect(formatIvsObsIngestUrl("https://abcd.global-contribute.live-video.net/app/")).toBe(
      "rtmps://abcd.global-contribute.live-video.net:443/app/",
    );
  });

  it("returns null for empty input", () => {
    expect(formatIvsObsIngestUrl(null)).toBeNull();
    expect(formatIvsObsIngestUrl("")).toBeNull();
    expect(formatIvsObsIngestUrl("   ")).toBeNull();
  });
});
