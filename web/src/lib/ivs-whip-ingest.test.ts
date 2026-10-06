import { describe, expect, it } from "vitest";
import { IVS_WHIP_SERVER_URL, isIvsWhipIngestEndpoint } from "@/lib/ivs-whip-ingest";

describe("isIvsWhipIngestEndpoint", () => {
  it("detects the global WHIP server", () => {
    expect(isIvsWhipIngestEndpoint(IVS_WHIP_SERVER_URL)).toBe(true);
    expect(isIvsWhipIngestEndpoint("https://GLOBAL.WHIP.LIVE-VIDEO.NET")).toBe(true);
  });

  it("rejects RTMPS / empty", () => {
    expect(isIvsWhipIngestEndpoint("rtmps://abc.global-contribute.live-video.net:443/app/")).toBe(false);
    expect(isIvsWhipIngestEndpoint(null)).toBe(false);
    expect(isIvsWhipIngestEndpoint("")).toBe(false);
  });
});
