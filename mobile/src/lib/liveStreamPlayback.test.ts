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
    it('active stage show previews HLS and arms the WebRTC upgrade', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: true });
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
      markBuyerStageSubscribeTornDown();
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
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
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('after Stage leave with no HLS mirror, WebRTC is still allowed', () => {
      markBuyerStageSubscribeTornDown();
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

    it('keeps HLS after Stage leave even when HLS is stalled — forced WebRTC remount thrash', () => {
      markBuyerStageSubscribeTornDown();
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: false });
      // Post-leave + hlsStalled must NOT force WebRTC (black Stage rejoin loop after home swipe).
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
      ).toEqual({ transport: 'hls', armUpgrade: false });
    });

    it('host Play clears the Stage leave latch so WebRTC upgrade is allowed again', () => {
      markBuyerStageSubscribeTornDown();
      expect(isBuyerStageWebrtcRejoinBlocked()).toBe(true);
      clearBuyerStageSubscribeTornDown();
      expect(isBuyerStageWebrtcRejoinBlocked()).toBe(false);
      expect(
        resolveSurfaceTransportPlan({
          stream: liveStageStream,
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'hls', armUpgrade: true });
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

  it('escalates host Play to full Stage rejoin when warm publish toggle fails', () => {
    expect(shouldEscalateHostResumeToFullRejoin(false)).toBe(true);
    expect(shouldEscalateHostResumeToFullRejoin(true)).toBe(false);
  });
});
