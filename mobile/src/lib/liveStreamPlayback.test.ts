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
    });
  });

  it('parseBuyerSafeStreamPayload defaults streamMode/stageAvailable when absent', () => {
    const parsed = parseBuyerSafeStreamPayload({ stream: { streamHealth: 'offline' } });
    expect(parsed?.streamMode).toBe('channel_hls');
    expect(parsed?.stageAvailable).toBe(false);
  });

  it('preferHlsOverWebrtcOnClient is false on native mobile (WebRTC primary)', () => {
    expect(preferHlsOverWebrtcOnClient()).toBe(false);
  });

  it('shouldUseStageWebrtcPlayback requires stage_webrtc + stageAvailable + live signal', () => {
    expect(
      shouldUseStageWebrtcPlayback(
        { streamMode: 'stage_webrtc', stageAvailable: true, streamHealth: 'live' },
        false,
      ),
    ).toBe(true);
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
