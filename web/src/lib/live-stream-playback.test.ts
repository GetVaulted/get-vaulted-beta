import { describe, expect, it } from "vitest";
import {
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  preferNativeHlsElementPlayback,
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
        streamMode: "stage_webrtc",
        stageAvailable: true,
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
      latencyMode: null,
      streamMode: "stage_webrtc",
      stageAvailable: true,
      streamPaused: false,
    });
  });

  it("parseBuyerSafeStreamPayload defaults streamMode/stageAvailable when absent", () => {
    const parsed = parseBuyerSafeStreamPayload({
      stream: { streamHealth: "offline" },
    });
    expect(parsed?.streamMode).toBe("channel_hls");
    expect(parsed?.stageAvailable).toBe(false);
  });

  it("parseBuyerSafeStreamPayload returns null for invalid payloads", () => {
    expect(parseBuyerSafeStreamPayload(null)).toBeNull();
    expect(parseBuyerSafeStreamPayload({})).toBeNull();
    expect(parseBuyerSafeStreamPayload({ stream: "x" })).toBeNull();
  });

  it("preferNativeHlsElementPlayback is true on iOS only", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(preferNativeHlsElementPlayback()).toBe(true);
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
    });
    expect(preferNativeHlsElementPlayback()).toBe(false);
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: original });
  });

  it("preferHlsOverWebrtcOnClient is false (WebRTC primary for stage sellers)", () => {
    expect(preferHlsOverWebrtcOnClient()).toBe(false);
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
