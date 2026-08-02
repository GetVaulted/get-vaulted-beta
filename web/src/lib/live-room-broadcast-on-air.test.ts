import { describe, expect, it } from "vitest";
import {
  isLiveRoomBroadcastOnAir,
  isLiveRoomBroadcastPurchasable,
  isLiveRoomRemotePublisherActive,
  isLiveStreamDisconnectConfirmed,
} from "@/lib/live-room-broadcast-on-air";

describe("isLiveRoomBroadcastOnAir", () => {
  it("requires live lifecycle and stream signal", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: false }),
    ).toBe(true);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "connecting", streamPaused: false }),
    ).toBe(true);
  });

  it("blocks commerce before the host starts a broadcast session", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "offline", streamPaused: false }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastPurchasable({ status: "live", streamHealth: "offline", streamPaused: false }),
    ).toBe(false);
  });

  it("allows warm-up offline after the host has started broadcasting", () => {
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("blocks scheduled rooms, paused streams, and confirmed disconnects", () => {
    expect(
      isLiveRoomBroadcastOnAir({ status: "scheduled", streamHealth: "live", streamPaused: false }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({ status: "live", streamHealth: "live", streamPaused: true }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("keeps stage WebRTC commerce open while the channel mirror is offline after start", () => {
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
      }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(true);
  });

  it("keeps OBS channel_hls soft on-air during brief offline after start", () => {
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "channel_hls",
        streamStartedAt: "2026-07-02T18:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("does not treat Stage warm-up offline as a remote publisher (companion / elsewhere)", () => {
    expect(
      isLiveRoomRemotePublisherActive({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
      }),
    ).toBe(false);
    expect(
      isLiveRoomRemotePublisherActive({
        status: "live",
        streamHealth: "live",
        streamPaused: false,
        streamMode: "stage_webrtc",
      }),
    ).toBe(true);
  });
});

describe("isLiveRoomBroadcastPurchasable", () => {
  it("stays purchasable while the host is paused", () => {
    expect(
      isLiveRoomBroadcastPurchasable({
        status: "live",
        streamHealth: "live",
        streamPaused: true,
      }),
    ).toBe(true);
  });

  it("blocks purchases after a confirmed disconnect", () => {
    expect(
      isLiveRoomBroadcastPurchasable({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("isLiveStreamDisconnectConfirmed", () => {
  it("detects ended streams and post-live offline windows", () => {
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "ended",
        streamPaused: false,
      }),
    ).toBe(true);
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamStartedAt: "2026-07-02T18:00:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(true);
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
      }),
    ).toBe(false);
  });

  it("clears disconnect after host republishes (newer streamStartedAt)", () => {
    expect(
      isLiveStreamDisconnectConfirmed({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
        streamStartedAt: "2026-07-02T18:10:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(false);
    expect(
      isLiveRoomBroadcastOnAir({
        status: "live",
        streamHealth: "offline",
        streamPaused: false,
        streamMode: "stage_webrtc",
        streamStartedAt: "2026-07-02T18:10:00.000Z",
        streamEndedAt: "2026-07-02T18:05:00.000Z",
      }),
    ).toBe(true);
  });
});
