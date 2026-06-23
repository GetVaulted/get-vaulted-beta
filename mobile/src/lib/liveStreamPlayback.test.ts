import { describe, expect, it } from 'vitest';
import {
  isLiveStreamSignal,
  parseBuyerSafeStreamPayload,
  preferHlsOverWebrtcOnClient,
  shouldAttachHlsPlayback,
  shouldUseStageWebrtcPlayback,
} from './liveStreamPlayback';

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

  it('preferHlsOverWebrtcOnClient is true (HLS primary for buyers)', () => {
    expect(preferHlsOverWebrtcOnClient()).toBe(true);
  });

  it('shouldUseStageWebrtcPlayback is false when HLS is preferred', () => {
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        false,
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
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: false, streamHealth: 'live' },
        false,
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'offline' },
        false,
      ),
    ).toBe(false);
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        true,
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
});
