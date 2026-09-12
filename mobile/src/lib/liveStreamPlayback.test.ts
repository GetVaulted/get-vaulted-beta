import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOST_AWAY_NO_VIDEO_MS,
  clearBuyerStageSubscribeTornDown,
  isBuyerStageWebrtcRejoinBlocked,
  isLiveStreamSignal,
  markBuyerStageSubscribeTornDown,
  mergeRealtimeStreamPaused,
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  reconcilePolledStreamPaused,
  resetBuyerStageSubscribeTornDownForTests,
  resolveLivePlaybackSurfaceState,
  resolveSurfaceTransportPlan,
  shouldAttachHlsPlayback,
  shouldEscalateHostResumeToFullRejoin,
  shouldTreatAsLocalHostAway,
  shouldUseStageWebrtcPlayback,
} from './liveStreamPlayback';

const liveStageStream = {
  streamMode: 'stage_webrtc',
  stageAvailable: true,
  streamHealth: 'live',
  playbackUrl: 'https://x.m3u8',
};

describe('liveStreamPlayback', () => {
  beforeEach(() => {
    resetBuyerStageSubscribeTornDownForTests();
  });

  it('parseBuyerSafeStreamPayload reads streamMode and stageAvailable', () => {
    const parsed = parseBuyerSafeStreamPayload({
      stream: {
        playbackUrl: 'https://example.com/playlist.m3u8',
        streamHealth: 'live',
        streamStartedAt: '2026-01-01T00:00:00.000Z',
        streamEndedAt: null,
        lastStatusSyncAt: '2026-01-02T00:00:00.000Z',
        streamMode: 'stage_webrtc',
        stageAvailable: true,
      },
    });
    expect(parsed).toEqual({
      playbackUrl: 'https://example.com/playlist.m3u8',
      streamHealth: 'live',
      streamStartedAt: '2026-01-01T00:00:00.000Z',
      streamEndedAt: null,
      lastStatusSyncAt: '2026-01-02T00:00:00.000Z',
      streamMode: 'stage_webrtc',
      stageAvailable: true,
      streamPaused: false,
    });
  });

  it('parseBuyerSafeStreamPayload defaults streamMode/stageAvailable when absent', () => {
    const parsed = parseBuyerSafeStreamPayload({ stream: { streamHealth: 'offline' } });
    expect(parsed?.streamMode).toBe('channel_hls');
    expect(parsed?.stageAvailable).toBe(false);
  });

  it('preferHlsOverWebrtcOnClient is false (buyers use Stage when available)', () => {
    expect(preferHlsOverWebrtcOnClient()).toBe(false);
  });

  it('shouldUseStageWebrtcPlayback is true for live stage rooms when signed in', () => {
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        false,
        'supabase-jwt',
      ),
    ).toBe(true);
  });

  it('shouldUseStageWebrtcPlayback is false when HLS failover already failed twice', () => {
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        true,
        'supabase-jwt',
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        false,
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'channel_hls', stageAvailable: true, streamHealth: 'live' },
        false,
        'supabase-jwt',
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: false, streamHealth: 'live' },
        false,
        'supabase-jwt',
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'offline' },
        false,
        'supabase-jwt',
      ),
    ).toBe(false);
  });

  it('isLiveStreamSignal is true for live/connecting only', () => {
    expect(isLiveStreamSignal('live')).toBe(true);
    expect(isLiveStreamSignal('CONNECTING')).toBe(true);
    expect(isLiveStreamSignal('offline')).toBe(false);
    expect(isLiveStreamSignal('ended')).toBe(false);
  });

  it('shouldAttachHlsPlayback is true only for live/connecting with URL', () => {
    expect(shouldAttachHlsPlayback('live', 'https://x.m3u8')).toBe(true);
    expect(shouldAttachHlsPlayback('connecting', 'https://x.m3u8')).toBe(true);
    expect(shouldAttachHlsPlayback('live', null)).toBe(false);
    expect(shouldAttachHlsPlayback('offline', 'https://x.m3u8')).toBe(false);
  });

  describe('resolveSurfaceTransportPlan (hybrid transport)', () => {
    it('active stage show joins WebRTC immediately (cold Stage→HLS mirrors are too slow)', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('active stage show goes straight to WebRTC once already upgraded (no drop back to HLS)', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: true,
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('active stage show goes straight to WebRTC when hybrid is disabled', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: false,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('active stage show with no HLS mirror yet goes straight to WebRTC', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: { ...liveStageStream, playbackUrl: null },
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('neighbor stage show buffers HLS (never joins WebRTC) when hybrid is on', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: false,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('neighbor stage show stays waiting (no media) when hybrid is off', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: false,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: false,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'waiting', armUpgrade: false });
    });

    it('channel_hls active show attaches HLS directly', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: { ...liveStageStream, streamMode: 'channel_hls', stageAvailable: false },
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('failed-over stage show falls back to HLS on the active surface', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: true,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('after Stage leave, active show stays on HLS and does not re-arm WebRTC upgrade', () => {
      markBuyerStageSubscribeTornDown('room_a');
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
      // Even if a previous visit had already upgraded, do not go back to WebRTC when HLS exists.
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: true,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('after Stage leave with no HLS mirror, WebRTC is still allowed', () => {
      markBuyerStageSubscribeTornDown('room_a');
      expect(
        resolveSurfaceTransportPlan({
          stream: { ...liveStageStream, playbackUrl: null },
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('after Stage leave prefers HLS first, then WebRTC once HLS stalls', () => {
      markBuyerStageSubscribeTornDown('room_a');
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
      // Dead HLS after leave must not trap buyers — allow one WebRTC remount (caller clears latch).
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          hlsStalled: true,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('host Play clears the Stage leave latch so WebRTC is allowed again', () => {
      markBuyerStageSubscribeTornDown('room_a');
      expect(isBuyerStageWebrtcRejoinBlocked('room_a')).toBe(true);
      clearBuyerStageSubscribeTornDown('room_a');
      expect(isBuyerStageWebrtcRejoinBlocked('room_a')).toBe(false);
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          roomId: 'room_a',
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('does not poison a different show after one room was background-latched', () => {
      markBuyerStageSubscribeTornDown('room_a');
      expect(isBuyerStageWebrtcRejoinBlocked('room_a')).toBe(true);
      expect(isBuyerStageWebrtcRejoinBlocked('room_b')).toBe(false);
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          roomId: 'room_b',
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });

    it('stalled HLS on the first visit (no leave) also forces WebRTC instead of an HLS preview', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
          hlsStalled: true,
        }),
      ).toEqual({ transport: 'webrtc', armUpgrade: false });
    });
  });

  it('resolveLivePlaybackSurfaceState maps health to surface', () => {
    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: false,
        streamHealth: 'live',
        playbackUrl: 'https://x.m3u8',
        videoHasRenderableData: true,
        playerFatal: false,
        roomLifecycleLive: true,
      }),
    ).toBe('live');
  });

  it('flags prolonged no-video as soft host-away without requiring server streamPaused', () => {
    expect(
      shouldTreatAsLocalHostAway({
        playbackActive: true,
        roomLifecycleLive: true,
        serverStreamPaused: false,
        videoHasData: false,
        msWithoutVideo: HOST_AWAY_NO_VIDEO_MS,
      }),
    ).toBe(true);
    expect(
      shouldTreatAsLocalHostAway({
        playbackActive: true,
        roomLifecycleLive: true,
        serverStreamPaused: false,
        videoHasData: false,
        msWithoutVideo: HOST_AWAY_NO_VIDEO_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldTreatAsLocalHostAway({
        playbackActive: true,
        roomLifecycleLive: true,
        serverStreamPaused: true,
        videoHasData: false,
        msWithoutVideo: HOST_AWAY_NO_VIDEO_MS,
      }),
    ).toBe(false);
  });

  it('merges realtime streamPaused into player metadata immediately', () => {
    const base = {
      playbackUrl: 'https://x.m3u8',
      streamHealth: 'live',
      streamPaused: false,
      streamStartedAt: null,
      streamEndedAt: null,
      lastStatusSyncAt: null,
      streamMode: 'stage_webrtc',
      stageAvailable: true,
    };
    expect(mergeRealtimeStreamPaused(base, true)?.streamPaused).toBe(true);
    expect(mergeRealtimeStreamPaused(null, true)).toBeNull();
  });

  // Regression: buyer stuck on the "Host paused" overlay after a host crash + reconnect where
  // the matching "unpaused" realtime broadcast never arrived, even though GET /stream (and
  // therefore actual playback) had already confirmed the host resumed.
  it('reconciles a stuck realtime "paused" hint once the poll confirms unpaused', () => {
    // The exact bug: realtime latched true, poll self-healed to false — must clear to null (defer
    // to poll) rather than staying stuck true forever.
    expect(reconcilePolledStreamPaused(true, false)).toBeNull();
  });

  it('does not touch a "no hint" state when the poll confirms unpaused', () => {
    expect(reconcilePolledStreamPaused(null, false)).toBeNull();
  });

  it('does not touch an already-false hint when the poll confirms unpaused', () => {
    expect(reconcilePolledStreamPaused(false, false)).toBe(false);
  });

  it('never lets a stale "still paused" poll override a fresher realtime "unpaused" hint', () => {
    // Poll hasn't caught up yet (still reports paused) — realtime's `false` is newer and must win.
    expect(reconcilePolledStreamPaused(false, true)).toBe(false);
  });

  it('a paused poll result is always a no-op regardless of the current hint', () => {
    expect(reconcilePolledStreamPaused(true, true)).toBe(true);
    expect(reconcilePolledStreamPaused(null, true)).toBeNull();
  });

  it('escalates host Play to full Stage rejoin when warm publish toggle fails', () => {
    expect(shouldEscalateHostResumeToFullRejoin(false)).toBe(true);
    expect(shouldEscalateHostResumeToFullRejoin(true)).toBe(false);
  });
});
