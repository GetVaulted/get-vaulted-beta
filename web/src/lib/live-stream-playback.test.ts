import { describe, expect, it, vi } from "vitest";
import {
  liveStageObjectFitForStreamMode,
  liveStageObjectFitForPlayback,
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  preferNativeHlsElementPlayback,
  resolveLivePlaybackSurfaceState,
  shouldAttachHlsPlayback,
} from "@/lib/live-stream-playback";

describe("live-stream-playback", () => {
  it("liveStageObjectFitForStreamMode letterboxes OBS/HLS and fills phone Stage", () => {
    expect(liveStageObjectFitForStreamMode("channel_hls")).toBe("contain");
    expect(liveStageObjectFitForStreamMode("stage_webrtc")).toBe("cover");
    expect(liveStageObjectFitForStreamMode(null)).toBe("cover");
  });

  it("liveStageObjectFitForPlayback letterboxes Stage→HLS mirrors", () => {
    expect(liveStageObjectFitForPlayback({ streamMode: "stage_webrtc", transport: "hls" })).toBe("contain");
    expect(liveStageObjectFitForPlayback({ streamMode: "stage_webrtc", transport: "webrtc" })).toBe("cover");
    expect(liveStageObjectFitForPlayback({ streamMode: "channel_hls", transport: "hls" })).toBe("contain");
  });

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
    // Stub the global directly rather than mutating an ambient `navigator` — this file runs under
    // vitest's "node" environment, which doesn't provide `navigator` on every Node version (only
    // Node 21+ exposes it by default), so relying on it existing already is not portable.
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(preferNativeHlsElementPlayback()).toBe(true);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
    });
    expect(preferNativeHlsElementPlayback()).toBe(false);
    vi.unstubAllGlobals();
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
