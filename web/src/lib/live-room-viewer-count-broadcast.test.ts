import { describe, expect, it } from "vitest";
import {
  parseViewerCountBroadcast,
  shouldPublishViewerCountBroadcast,
} from "./live-room-viewer-count-broadcast";

describe("parseViewerCountBroadcast", () => {
  it("accepts finite non-negative counts", () => {
    expect(parseViewerCountBroadcast({ viewerCount: 12 })).toBe(12);
    expect(parseViewerCountBroadcast({ count: 3.9 })).toBe(3);
    expect(parseViewerCountBroadcast({ viewerCount: -2 })).toBe(0);
  });

  it("rejects bad payloads", () => {
    expect(parseViewerCountBroadcast(null)).toBeNull();
    expect(parseViewerCountBroadcast({ viewerCount: "12" })).toBeNull();
  });
});

describe("shouldPublishViewerCountBroadcast", () => {
  it("publishes the first count immediately", () => {
    expect(
      shouldPublishViewerCountBroadcast({
        nextCount: 5,
        lastCount: null,
        lastPublishedAtMs: 0,
        nowMs: 1000,
      }),
    ).toBe(true);
  });

  it("throttles unchanged and allows faster updates on change", () => {
    expect(
      shouldPublishViewerCountBroadcast({
        nextCount: 5,
        lastCount: 5,
        lastPublishedAtMs: 1000,
        nowMs: 2000,
      }),
    ).toBe(false);
    expect(
      shouldPublishViewerCountBroadcast({
        nextCount: 6,
        lastCount: 5,
        lastPublishedAtMs: 1000,
        nowMs: 1800,
      }),
    ).toBe(true);
  });
});
