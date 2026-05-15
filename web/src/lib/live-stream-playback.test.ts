import { describe, expect, it } from "vitest";
import {
  parseBuyerSafeStreamPayload,
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from "@/lib/live-stream-playback";

describe("live-stream-playback", () => {
  it("parseBuyerSafeStreamPayload reads only nested stream fields", () => {
    const parsed = parseBuyerSafeStreamPayload({
      stream: {
        playbackUrl: "https://example.com/playlist.m3u8",
        streamHealth: "live",
        streamStartedAt: "2026-01-01T00:00:00.000Z",
        streamEndedAt: null,
        lastStatusSyncAt: "2026-01-02T00:00:00.000Z",
        ingestEndpoint: "rtmps://secret",
        streamKeyArn: "arn:aws:ivs:secret",
      },
      viewerRole: "host",
    });
    expect(parsed).toEqual({
      playbackUrl: "https://example.com/playlist.m3u8",
      streamHealth: "live",
      streamStartedAt: "2026-01-01T00:00:00.000Z",
      streamEndedAt: null,
      lastStatusSyncAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("parseBuyerSafeStreamPayload returns null for invalid payloads", () => {
    expect(parseBuyerSafeStreamPayload(null)).toBeNull();
    expect(parseBuyerSafeStreamPayload({})).toBeNull();
    expect(parseBuyerSafeStreamPayload({ stream: "x" })).toBeNull();
  });

  it("shouldAttachHlsPlayback is true only for live/connecting with URL", () => {
    expect(shouldAttachHlsPlayback("live", "https://x.m3u8")).toBe(true);
    expect(shouldAttachHlsPlayback("CONNECTING", "https://x.m3u8")).toBe(true);
    expect(shouldAttachHlsPlayback("offline", "https://x.m3u8")).toBe(false);
    expect(shouldAttachHlsPlayback("live", null)).toBe(false);
    expect(shouldAttachHlsPlayback("live", "")).toBe(false);
  });

  it("resolveLivePlaybackSurfaceState covers loading/offline/live/error", () => {
    expect(
      resolveLivePlaybackSurfaceState({
        loading: true,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "offline",
        playbackUrl: null,
        videoHasRenderableData: false,
        playerFatal: false,
      }),
    ).toBe("loading");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: true,
        reconnecting: false,
        streamHealth: "live",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: false,
        playerFatal: false,
      }),
    ).toBe("error");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: true,
        reconnecting: false,
        streamHealth: "offline",
        playbackUrl: null,
        videoHasRenderableData: false,
        playerFatal: false,
        roomLifecycleLive: false,
      }),
    ).toBe("offline");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: true,
        streamHealth: "live",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: true,
        playerFatal: false,
      }),
    ).toBe("reconnecting");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "offline",
        playbackUrl: null,
        videoHasRenderableData: false,
        playerFatal: false,
      }),
    ).toBe("offline");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "error",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: false,
        playerFatal: false,
        roomLifecycleLive: false,
      }),
    ).toBe("offline");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "live",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: false,
        playerFatal: true,
        roomLifecycleLive: false,
      }),
    ).toBe("offline");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "live",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: true,
        playerFatal: false,
      }),
    ).toBe("live");

    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: "live",
        playbackUrl: "https://x.m3u8",
        videoHasRenderableData: false,
        playerFatal: false,
      }),
    ).toBe("connecting");
  });
});
