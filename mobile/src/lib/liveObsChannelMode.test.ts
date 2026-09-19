import { describe, expect, it } from 'vitest';
import { isObsChannelHlsMode, isObsDesktopBroadcastMode } from './liveObsChannelMode';

describe('isObsChannelHlsMode', () => {
  it('detects channel_hls only', () => {
    expect(isObsChannelHlsMode('channel_hls')).toBe(true);
    expect(isObsChannelHlsMode('CHANNEL_HLS')).toBe(true);
    expect(isObsChannelHlsMode('stage_webrtc')).toBe(false);
    expect(isObsChannelHlsMode(null)).toBe(false);
    expect(isObsChannelHlsMode(undefined)).toBe(false);
  });
});

describe('isObsDesktopBroadcastMode', () => {
  it('treats legacy HLS and WHIP Stage as desktop OBS', () => {
    expect(isObsDesktopBroadcastMode({ streamMode: 'channel_hls' })).toBe(true);
    expect(
      isObsDesktopBroadcastMode({
        streamMode: 'stage_webrtc',
        ingestEndpoint: 'https://global.whip.live-video.net',
      }),
    ).toBe(true);
    expect(
      isObsDesktopBroadcastMode({
        streamMode: 'stage_webrtc',
        ingestEndpoint: null,
      }),
    ).toBe(false);
  });
});
