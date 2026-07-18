import { describe, expect, it } from 'vitest';
import {
  isLiveStreamSignal,
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  resolveLivePlaybackSurfaceState,
  resolveSurfaceTransportPlan,
  shouldAttachHlsPlayback,
  shouldUseStageWebrtcPlayback,
} from './liveStreamPlayback';

const liveStageStream = {
  streamMode: 'stage_webrtc',
  stageAvailable: true,
  streamHealth: 'live',
  playbackUrl: 'https://x.m3u8',
};

describe('liveStreamPlayback', () => {
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

  it('preferHlsOverWebrtcOnClient is false (WebRTC primary for stage sellers)', () => {
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
    expect(shouldAttachHlsPlayback('offline', 'https://x.m3u8')).toBe(false);
    expect(shouldAttachHlsPlayback('live', null)).toBe(false);
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

    it('offline show with no URL resolves to none', () => {
      expect(
        resolveSurfaceTransportPlan({
          stream: { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'offline', playbackUrl: null },
          isActive: true,
          webrtcFailed: false,
          accessToken: 'jwt',
          hybridEnabled: true,
          alreadyUpgraded: false,
        }),
      ).toEqual({ transport: 'none', armUpgrade: false });
    });
  });

  it('resolveLivePlaybackSurfaceState prefers live over reconnecting when frames are ready', () => {
    expect(
      resolveLivePlaybackSurfaceState({
        loading: false,
        fetchFailed: false,
        reconnecting: true,
        streamHealth: 'live',
        playbackUrl: 'https://x.m3u8',
        videoHasRenderableData: true,
        playerFatal: false,
      }),
    ).toBe('live');
  });
});
